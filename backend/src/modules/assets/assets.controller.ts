import fs from 'node:fs';
import path from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('assets')
export class AssetsController {
  @Get('logo.svg')
  async logoSvg(@Res() res: Response) {
    const svgPath = path.resolve(process.cwd(), 'Sutra-Logo.svg');
    if (!fs.existsSync(svgPath)) {
      res.status(404).json({ message: 'Logo not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(svgPath);
  }

  @Get('logo.ico')
  async logoIco(@Res() res: Response) {
    const icoPath = path.resolve(process.cwd(), '..', 'Sutra-Logo.ico');
    if (!fs.existsSync(icoPath)) {
      res.status(404).json({ message: 'Logo not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/x-icon');
    res.sendFile(icoPath);
  }
}
