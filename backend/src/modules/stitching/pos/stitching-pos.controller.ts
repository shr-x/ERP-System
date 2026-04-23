import { Body, Controller, Get, Param, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../../common/auth/current-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles';
import { CreatePosStitchingOrderDto } from './stitching-pos.dtos';
import { StitchingPosService } from './stitching-pos.service';

@ApiTags('POS Stitching')
@ApiBearerAuth()
@Controller('pos/stitching')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class StitchingPosController {
  constructor(private readonly stitching: StitchingPosService) {}

  @Get('templates')
  async templates(@CurrentUser() user: any) {
    return this.stitching.listTemplates(user.orgId);
  }

  @Get('tailors')
  async tailors(@CurrentUser() user: any) {
    return this.stitching.listActiveTailors(user.orgId);
  }

  @Post('orders')
  async createOrder(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreatePosStitchingOrderDto
  ) {
    return this.stitching.createOrder(user, body);
  }

  @Post('orders/:id/tailor-slip/share')
  async shareTailorSlip(@CurrentUser() user: any, @Param('id') id: string) {
    const link = await this.stitching.createTailorSlipShareLink(user.orgId, id);
    return { token: link.token, a4Path: `/share/stitching-tailor/${link.token}/a4` };
  }
}

