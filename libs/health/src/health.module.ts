/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Version } from '@lib/common';
import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';

import { HEALTH_CONFIG } from './health.constants';
import { HealthController } from './health.controller';

export interface HealthControllerConfigParams {
  version: Version;
  extraHealthData?: () => Promise<Record<string, any>>;
}

export interface HealthModuleAsyncParams extends Pick<ModuleMetadata, 'imports' | 'providers'> {
  useFactory: (
    ...args: any[]
  ) => HealthControllerConfigParams | Promise<HealthControllerConfigParams>;
  inject?: any[];
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {
  static register(options: HealthControllerConfigParams): DynamicModule {
    return {
      module: HealthModule,
      providers: [{ provide: HEALTH_CONFIG, useValue: options }],
    };
  }

  static forRootAsync(options: HealthModuleAsyncParams): DynamicModule {
    return {
      module: HealthModule,
      imports: options.imports,
      providers: [
        {
          provide: HEALTH_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ],
    };
  }
}
