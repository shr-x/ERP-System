import fs from 'node:fs';
import path from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller('assets')
export class AssetsController {
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

