import { Body, Controller, Get, Param, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user';
import { AdminJwtGuard } from '../stitching/common/admin-jwt.guard';
import { CreateErpExpenseDto, CreateErpInvoiceDto, ErpListMaterialsQueryDto, ErpMaterialsByIdsQueryDto } from './erp.dtos';
import { ErpService } from './erp.service';

@ApiTags('ERP Integration')
@ApiBearerAuth()
@Controller('erp')
@UseGuards(AdminJwtGuard)
export class ErpController {
  constructor(private readonly erp: ErpService) {}

  @Get('materials')
  async materials(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ErpListMaterialsQueryDto
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.erp.listDressMaterials(user.orgId, { storeId: query.storeId, q: query.q, page, pageSize });
  }

  @Get('materials/by-ids')
  async materialsByIds(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ErpMaterialsByIdsQueryDto
  ) {
    const ids = query.ids
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return this.erp.listDressMaterialsByIds(user.orgId, { storeId: query.storeId, ids });
  }

  @Get('customers/:id')
  async customer(@CurrentUser() user: any, @Param('id') id: string) {
    return { customer: await this.erp.getCustomer(user.orgId, id) };
  }

  @Post('invoice')
  async invoice(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateErpInvoiceDto
  ) {
    return this.erp.createInvoice(user, body);
  }

  @Post('expense')
  async expense(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateErpExpenseDto
  ) {
    return this.erp.createExpense(user, body);
  }
}
