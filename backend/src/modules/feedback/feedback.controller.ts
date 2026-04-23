import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { z } from 'zod';

const submitFeedbackSchema = z.object({
  rating: z
    .union([z.number(), z.string().trim().min(1).transform((v) => Number(v))])
    .refine((v) => Number.isFinite(v) && Number.isInteger(v) && v >= 1 && v <= 5, { message: 'Invalid rating' }),
  comment: z.string().trim().max(500).optional().or(z.literal(''))
});

const listFeedbackSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal(''))
});

@Controller()
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('feedback/:token')
  async form(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).feedbackLink.findFirst({
      where: { token },
      select: { orgId: true, invoiceId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: link.invoiceId, orgId: link.orgId },
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        customer: { select: { fullName: true } },
        store: { select: { name: true } }
      }
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const existing = await (this.prisma as any).feedback.findFirst({
      where: { invoiceId: invoice.id },
      select: { id: true, rating: true, comment: true, createdAt: true }
    });

    if (existing) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderFeedbackDonePage({ already: true }));
    }

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Sutra Feedback</title>
          <style>
            :root { --bg: #f8f9fb; --card: #ffffff; --line: #e5e7eb; --fg: #111827; --muted: #6b7280; --accent: #ef4444; }
            * { box-sizing: border-box; }
            body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: linear-gradient(180deg, #fbfcff, #f8f9fb); margin:0; padding:20px; color: var(--fg); min-height: 100vh; display:flex; align-items: center; justify-content: center; }
            .card { width: 100%; max-width: 460px; background: var(--card); border:1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: 0 22px 60px rgba(15,23,42,0.08); transition: opacity .25s ease, transform .25s ease; }
            .brand { font-size: 12px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: .4px; }
            .title { font-size: 26px; line-height: 1.2; font-weight: 800; margin-top: 8px; }
            .sub { color: var(--muted); font-size: 14px; margin-top: 6px; }
            .meta { margin-top: 14px; background: #f9fafb; border: 1px solid #f1f5f9; border-radius: 12px; padding: 10px 12px; display:flex; flex-direction: column; gap: 4px; font-size: 13px; color: #4b5563; }
            .meta b { color: #111827; }
            .stars { display:flex; justify-content: center; gap: 8px; margin-top: 16px; }
            .star { appearance: none; background: transparent; border: 0; font-size: 32px; line-height: 1; color: #d1d5db; cursor: pointer; transform-origin: center; transition: transform .18s ease, color .18s ease; padding: 0 2px; }
            .star:hover { transform: scale(1.1); }
            .star.on { color: #f59e0b; }
            .rateLabel { margin-top: 8px; text-align:center; font-size: 13px; color: #6b7280; min-height: 18px; }
            .field { margin-top: 14px; }
            textarea { width:100%; min-height: 108px; resize: vertical; padding: 12px; border-radius: 10px; border:1px solid var(--line); font-size: 14px; }
            textarea:focus { outline:none; border-color: #fca5a5; box-shadow: 0 0 0 3px rgba(248,113,113,0.16); }
            .btn { width:100%; height: 46px; margin-top: 14px; border-radius: 10px; border:0; background: var(--accent); color:#fff; font-weight: 700; cursor:pointer; transition: filter .2s ease, transform .08s ease; }
            .btn:hover { filter: brightness(.98); }
            .btn:active { transform: scale(.98); }
            .btn:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
            .hidden { display:none; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">Sutra</div>
            <div class="title">How was your experience?</div>
            <div class="sub">Your feedback helps us improve</div>
            <div class="meta">
              <div><b>Invoice:</b> ${escapeHtml(invoice.invoiceNo)}</div>
              <div><b>Date:</b> ${new Date(invoice.invoiceDate).toLocaleString()}</div>
              <div><b>Customer:</b> ${escapeHtml(invoice.customer.fullName)}</div>
            </div>
            <form method="POST" action="/feedback/${encodeURIComponent(token)}">
              <input type="hidden" name="rating" id="ratingInput" value="5" />
              <div class="stars" id="stars">
                <button type="button" class="star on" data-v="1">★</button>
                <button type="button" class="star on" data-v="2">★</button>
                <button type="button" class="star on" data-v="3">★</button>
                <button type="button" class="star on" data-v="4">★</button>
                <button type="button" class="star on" data-v="5">★</button>
              </div>
              <div class="rateLabel" id="rateLabel">Excellent</div>
              <div class="field">
                <textarea name="comment" rows="4" placeholder="Tell us what you loved or what we can improve"></textarea>
              </div>
              <button type="submit" class="btn" id="submitBtn">Submit Feedback</button>
            </form>
          </div>
          <script>
            (function () {
              const stars = Array.from(document.querySelectorAll('.star'));
              const input = document.getElementById('ratingInput');
              const label = document.getElementById('rateLabel');
              const btn = document.getElementById('submitBtn');
              const labels = {1:'Poor',2:'Bad',3:'Okay',4:'Good',5:'Excellent'};
              let selected = 5;
              function paint(v){
                stars.forEach((s, i) => s.classList.toggle('on', i < v));
                label.textContent = labels[v] || '';
              }
              stars.forEach((s) => {
                s.addEventListener('mouseenter', () => paint(Number(s.dataset.v || 5)));
                s.addEventListener('mouseleave', () => paint(selected));
                s.addEventListener('click', () => {
                  selected = Number(s.dataset.v || 5);
                  input.value = String(selected);
                  paint(selected);
                });
              });
              paint(selected);
              document.querySelector('form').addEventListener('submit', () => {
                btn.disabled = true;
                btn.textContent = 'Submitting...';
              });
            })();
          </script>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Post('feedback/:token')
  async submit(@Param('token') token: string, @Body(new ZodValidationPipe(submitFeedbackSchema)) body: any, @Res() res: Response) {
    const link = await (this.prisma as any).feedbackLink.findFirst({
      where: { token },
      select: { orgId: true, invoiceId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: link.invoiceId, orgId: link.orgId },
      select: { id: true, customerId: true, customer: { select: { fullName: true } } }
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const existing = await (this.prisma as any).feedback.findFirst({
      where: { invoiceId: invoice.id },
      select: { id: true }
    });
    if (existing) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderFeedbackDonePage({ already: true }));
    }

    try {
      await (this.prisma as any).feedback.create({
        data: {
          orgId: link.orgId,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          customerName: invoice.customer.fullName,
          rating: body.rating,
          comment: body.comment?.trim() ? body.comment.trim() : null
        }
      } as any);
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderFeedbackDonePage({ already: true }));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFeedbackDonePage({ already: false }));
  }

  @Get('feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async list(@CurrentUser() user: any, @Query(new ZodValidationPipe(listFeedbackSchema)) query: any) {
    const q = query.q?.trim();
    const rows = await (this.prisma as any).feedback.findMany({
      where: {
        orgId: user.orgId,
        ...(q ? { customerName: { contains: q, mode: 'insensitive' } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customerName: true,
        invoice: { select: { invoiceNo: true, store: { select: { code: true, name: true } } } }
      }
    });
    return { feedbacks: rows };
  }
}

function escapeHtml(v: string) {
  return (v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderFeedbackDonePage(input: { already: boolean }) {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sutra Feedback</title>
        <style>
          body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f8f9fb; margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; color:#111827; }
          .card { width: 100%; max-width: 460px; background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:24px; box-shadow:0 22px 60px rgba(15,23,42,0.08); text-align:center; }
          .ok { font-size: 38px; line-height: 1; }
          .t { margin-top: 12px; font-size: 22px; font-weight: 800; }
          .s { margin-top: 8px; font-size: 14px; color:#6b7280; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="ok">✅</div>
          <div class="t">${input.already ? 'Feedback already submitted' : 'Thank you for your feedback!'}</div>
          <div class="s">${input.already ? "You've already submitted feedback for this order." : 'We appreciate your time ❤️'}</div>
        </div>
      </body>
    </html>
  `;
}
