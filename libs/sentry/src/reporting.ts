/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { ServiceError } from '@lib/common';
import { ExecutionContext } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import * as Sentry from '@sentry/node';
import { Request } from 'express';
import { IncomingMessage } from 'http';

// Matches uid, session, oauth and other common tokens which we would
// prefer not to include in Sentry reports.
const TOKENREGEX = /[a-fA-F0-9]{32,}/gi;
// RFC 5322 generalized email regex, ~ 99.99% accurate.
const EMAILREGEX =
  /(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/gi;
const FILTERED = '[Filtered]';
const URIENCODEDFILTERED = encodeURIComponent(FILTERED);

export interface ExtraContext {
  name: string;
  fieldData: Record<string, unknown>;
}

/**
 * Filters all of an objects string properties to remove tokens.
 *
 * @param obj Object to filter values on
 */
export function filterObject<T>(obj: T): T {
  if (typeof obj === 'object' && obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Typescript can't quite infer that this is the value that was
        // at that index, so a cast is needed.
        (obj as any)[key] = value.replace(TOKENREGEX, FILTERED).replace(EMAILREGEX, FILTERED);
      }
    }
  }
  return obj;
}

/**
 * Filter a sentry event for PII in addition to the default filters.
 *
 * Current replacements:
 *   - A 32-char hex string that typically is a FxA user-id.
 *
 * Data Removed:
 *   - Request body.
 *
 * @param event
 */
export function filterSentryEvent(event: Sentry.Event, hint: unknown): Sentry.Event {
  if (event.message) {
    event.message = event.message.replace(TOKENREGEX, FILTERED);
  }
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.message) {
        bc.message = bc.message.replace(TOKENREGEX, FILTERED);
      }
      if (bc.data) {
        bc.data = filterObject(bc.data);
      }
    }
  }
  if (event.request) {
    if (event.request.url) {
      event.request.url = event.request.url.replace(TOKENREGEX, FILTERED);
    }
    if (event.request.query_string) {
      if (typeof event.request.query_string === 'string') {
        event.request.query_string = event.request.query_string.replace(
          TOKENREGEX,
          URIENCODEDFILTERED,
        );
      } else {
        event.request.query_string = filterObject(event.request.query_string);
      }
    }
    if (event.request.headers) {
      (event as any).request.headers = filterObject(event.request.headers);
    }
    if (event.request.data) {
      // Remove request data entirely
      delete event.request.data;
    }
  }
  if (event.tags && event.tags.url) {
    event.tags.url = (event.tags.url as string).replace(TOKENREGEX, FILTERED);
  }
  return event;
}

/**
 * Capture a Error to Sentry with additional context.
 *
 * @param err Error object to capture.
 * @param extra Extra information.
 * @param excContexts Contexts.
 */
export function reportException(
  err: any,
  extra: {
    cause?: Error;
    data?: Record<string, any>;
    tags?: Record<string, string>;
    user?: Sentry.User;
  },
  excContexts: ExtraContext[] = [],
): void {
  Sentry.withScope((scope: Sentry.Scope) => {
    for (const ctx of excContexts) {
      scope.setContext(ctx.name, ctx.fieldData);
    }
    if (extra.cause) {
      scope.setExtra('exceptionCause', extra.cause);
    } else if (err.cause) {
      scope.setExtra('exceptionCause', err.cause);
    }
    if (extra.data) {
      scope.setContext('exceptionData', extra.data);
    } else if (err.data) {
      scope.setContext('exceptionData', err.data);
    }
    if (err.service) {
      scope.setTag('service', err.service);
    }
    if (extra.tags) {
      scope.setTags(extra.tags);
    }
    scope.setUser(extra.user);

    Sentry.captureException(err);
  });
}

/**
 * Report an exception with request and additional optional context objects.
 *
 * @param exception
 * @param excContexts List of additional exception context objects to capture.
 * @param request A request object if available.
 */
export function reportRequestException(
  exception: any,
  excContexts: ExtraContext[] = [],
  request?: Request | IncomingMessage,
): void {
  if (
    (exception as Error & { reported?: boolean; status?: number; response?: any }) instanceof Error
  ) {
    // Don't report HttpExceptions, we test for its two attributes as its more reliable
    // than instance checks of HttpException
    if (exception.status && exception.response) {
      return;
    }

    // Don't report already reported exceptions
    if (exception.reported) {
      return;
    }
  }

  Sentry.withScope((scope: Sentry.Scope) => {
    scope.addEventProcessor((event: Sentry.Event) => {
      if (request) {
        const sentryEvent = Sentry.addRequestDataToEvent(event, request);
        sentryEvent.level = 'error';
        return sentryEvent;
      }
      return null;
    });
    for (const ctx of excContexts) {
      scope.setContext(ctx.name, ctx.fieldData);
    }
    if (exception instanceof ServiceError) {
      if (exception.cause) {
        scope.setExtra('exceptionCause', exception.cause);
      }
      if (exception.data) {
        scope.setContext('exceptionData', exception.data);
      }
      scope.setTag('service', exception.service);
    }
    Sentry.captureException(exception);
    if ((exception as Error & { reported?: boolean }) instanceof Error) {
      exception.reported = true;
    }
  });
}

export function processException(context: ExecutionContext, exception: any): void {
  let request: Request | undefined;
  let gqlExec: GqlExecutionContext | undefined;
  if (context.getType() === 'http') {
    request = context.switchToHttp().getRequest();
  } else if (context.getType<GqlContextType>() === 'graphql') {
    gqlExec = GqlExecutionContext.create(context);
    request = gqlExec.getContext().req;
  } else if (context.getType() === 'ws') {
    request = context.switchToWs().getClient().request;
  }
  const excContexts: ExtraContext[] = [];
  if (gqlExec) {
    const info = gqlExec.getInfo();
    excContexts.push({
      name: 'graphql',
      fieldData: { fieldName: info.fieldName, path: info.path },
    });
  }

  reportRequestException(exception, excContexts, request);
}
