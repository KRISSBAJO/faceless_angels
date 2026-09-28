import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { MessageDto } from '../review/review.dto';
import { CreateCaseDto, SubmitCaseDto } from './cases.dto';
import { CasesService } from './cases.service';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

@Controller('cases')
@UseGuards(AuthGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.cases.listFor(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateCaseDto) {
    return this.cases.create(user.id, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cases.get(user.id, id);
  }

  @Post(':id/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }),
  )
  addEvidence(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('kind') kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.cases.addEvidence(user.id, id, kind, file);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: SubmitCaseDto,
  ) {
    return this.cases.submit(user, id);
  }

  @Post(':id/reply')
  @HttpCode(200)
  reply(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.cases.reply(user.id, id, dto.message);
  }

  @Post(':id/appeal')
  @HttpCode(200)
  appeal(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.cases.appeal(user.id, id, dto.message);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cases.withdraw(user.id, id);
  }
}
