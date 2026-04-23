import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user';
import { AdminJwtGuard } from '../common/admin-jwt.guard';
import { AssignTailorDto, CreateStitchingOrderDto, ListOrdersQueryDto, UpdateOrderStatusDto } from './stitching-orders.dtos';
import { StitchingOrdersService } from './stitching-orders.service';

@ApiTags('Stitching Orders')
@ApiBearerAuth()
@Controller('stitching/orders')
@UseGuards(AdminJwtGuard)
export class StitchingOrdersController {
  constructor(private readonly orders: StitchingOrdersService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListOrdersQueryDto
  ) {
    return this.orders.list(user.orgId, query);
  }

  @Get(':id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return { order: await this.orders.get(user.orgId, id) };
  }

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateStitchingOrderDto
  ) {
    return this.orders.create(user, body);
  }

  @Post(':id/assign-tailor')
  async assignTailor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: AssignTailorDto
  ) {
    return this.orders.assignTailor(user, id, body);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateOrderStatusDto
  ) {
    return this.orders.updateStatus(user.orgId, id, body);
  }

  @Get(':id/documents/customer-bill/a4')
  async customerBillA4(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.orders.customerBillPdf(user.orgId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="stitching_bill_${id}.pdf"`);
    res.send(pdf);
  }

  @Get(':id/documents/customer-bill/thermal')
  async customerBillThermal(@CurrentUser() user: any, @Param('id') id: string) {
    return { html: await this.orders.customerBillThermalHtml(user.orgId, id) };
  }

  @Get(':id/documents/tailor-slip/a4')
  async tailorSlipA4(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.orders.tailorSlipPdf(user.orgId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="tailor_slip_${id}.pdf"`);
    res.send(pdf);
  }

  @Get(':id/documents/tailor-slip/thermal')
  async tailorSlipThermal(@CurrentUser() user: any, @Param('id') id: string) {
    return { html: await this.orders.tailorSlipThermalHtml(user.orgId, id) };
  }
}

