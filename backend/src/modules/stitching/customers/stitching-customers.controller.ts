import { Body, Controller, Get, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user';
import { AdminJwtGuard } from '../common/admin-jwt.guard';
import { StitchingCustomerListQueryDto, SyncStitchingCustomerDto } from './stitching-customers.dtos';
import { StitchingCustomersService } from './stitching-customers.service';

@ApiTags('Stitching Customers')
@ApiBearerAuth()
@Controller('stitching/customers')
@UseGuards(AdminJwtGuard)
export class StitchingCustomersController {
  constructor(private readonly customers: StitchingCustomersService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: StitchingCustomerListQueryDto
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.customers.list(user.orgId, { q: query.q, page, pageSize });
  }

  @Post('sync/:erpCustomerId')
  async sync(
    @CurrentUser() user: any,
    @Param('erpCustomerId') erpCustomerId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: SyncStitchingCustomerDto
  ) {
    return { profile: await this.customers.sync(user.orgId, erpCustomerId, body) };
  }

  @Get(':erpCustomerId/profile')
  async profile(@CurrentUser() user: any, @Param('erpCustomerId') erpCustomerId: string) {
    return this.customers.getProfile(user.orgId, erpCustomerId);
  }
}
