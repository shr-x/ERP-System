import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user';
import { AdminJwtGuard } from '../common/admin-jwt.guard';
import { CreateStitchingTailorDto, StitchingTailorListQueryDto, UpdateStitchingTailorDto } from './stitching-tailors.dtos';
import { StitchingTailorsService } from './stitching-tailors.service';

@ApiTags('Stitching Tailors')
@ApiBearerAuth()
@Controller('stitching/tailors')
@UseGuards(AdminJwtGuard)
export class StitchingTailorsController {
  constructor(private readonly tailors: StitchingTailorsService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: StitchingTailorListQueryDto
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.tailors.list(user.orgId, { q: query.q, page, pageSize });
  }

  @Get(':id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return { tailor: await this.tailors.get(user.orgId, id) };
  }

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateStitchingTailorDto
  ) {
    return { tailor: await this.tailors.create(user.orgId, body) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateStitchingTailorDto
  ) {
    return { tailor: await this.tailors.update(user.orgId, id, body) };
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tailors.delete(user.orgId, id);
  }

  @Get(':id/jobs')
  async jobs(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tailors.jobList(user.orgId, id);
  }
}
