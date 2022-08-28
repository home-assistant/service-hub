import { Injectable } from '@nestjs/common';

@Injectable()
export class ExampleService {
  hello(): string {
    return 'Hello World!';
  }
}
