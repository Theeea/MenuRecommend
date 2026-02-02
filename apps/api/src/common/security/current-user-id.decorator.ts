import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUserId = createParamDecorator((_, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  // passport-jwt 기본: req.user에 payload가 들어있음
  return req.user?.sub || req.user?.id || req.user?.userId;
});
