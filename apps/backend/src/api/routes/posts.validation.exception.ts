import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { PostValidationException } from '@gitroom/nestjs-libraries/errors/post-validation.exception';

export type PostValidationError = {
  provider: string;
  name: string;
  error: string;
};

export { PostValidationException };

@Catch(PostValidationException)
export class PostValidationExceptionFilter implements ExceptionFilter {
  catch(exception: PostValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const { provider, name, error } =
      exception.getResponse() as PostValidationError;

    response.status(status).json({
      statusCode: status,
      provider,
      name,
      message: error,
    });
  }
}
