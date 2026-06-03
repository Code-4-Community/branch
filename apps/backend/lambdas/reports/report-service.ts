import db from './db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell as DocxTableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
} from 'docx';
import path from 'path';

// pdfmake's server-side Printer has no TS declarations; use require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake/js/Printer').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const URLResolver = require('pdfmake/js/URLResolver').default;

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-2' });

function getBucketName(): string {
  const bucket = process.env.REPORTS_BUCKET_NAME;
  if (!bucket) {
    throw new Error('REPORTS_BUCKET_NAME environment variable is not set');
  }
  return bucket;
}

const PDFMAKE_ROOT = path.join(require.resolve('pdfmake'), '..', '..');
const FONT_DIR = path.join(PDFMAKE_ROOT, 'build', 'fonts', 'Roboto');

const fonts = {
  Roboto: {
    normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
};

export interface ReportData {
  project: {
    project_id: number;
    name: string;
    description: string;
    total_budget: string | null;
    start_date: Date | null;
    end_date: Date | null;
    currency: string | null;
  };
  members: Array<{
    name: string;
    email: string;
    role: string;
    hours: string | null;
  }>;
  donations: Array<{
    organization: string;
    contact_name: string | null;
    amount: string;
    donated_at: Date | null;
  }>;
  expenditures: Array<{
    category: string | null;
    description: string | null;
    amount: string;
    spent_on: Date;
    entered_by_name: string | null;
  }>;
}

export async function checkProjectAccess(
  userId: number,
  projectId: number,
  isAdmin: boolean,
): Promise<boolean> {
  const projectExists = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .select('project_id')
    .executeTakeFirst();

  if (!projectExists) return false;

  if (isAdmin) return true;

  const membership = await db
    .selectFrom('branch.project_memberships')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .select('role')
    .executeTakeFirst();

  return !!membership;
}

export async function fetchReportData(projectId: number): Promise<ReportData | null> {
  const project = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', projectId)
    .selectAll()
    .executeTakeFirst();

  if (!project) return null;

  const members = await db
    .selectFrom('branch.project_memberships')
    .innerJoin('branch.users', 'branch.users.user_id', 'branch.project_memberships.user_id')
    .where('branch.project_memberships.project_id', '=', projectId)
    .select([
      'branch.users.name',
      'branch.users.email',
      'branch.project_memberships.role',
      'branch.project_memberships.hours',
    ])
    .execute();

  const donations = await db
    .selectFrom('branch.project_donations')
    .innerJoin('branch.donors', 'branch.donors.donor_id', 'branch.project_donations.donor_id')
    .where('branch.project_donations.project_id', '=', projectId)
    .select([
      'branch.donors.organization',
      'branch.donors.contact_name',
      'branch.project_donations.amount',
      'branch.project_donations.donated_at',
    ])
    .execute();

  const expenditures = await db
    .selectFrom('branch.expenditures')
    .leftJoin('branch.users', 'branch.users.user_id', 'branch.expenditures.entered_by')
    .where('branch.expenditures.project_id', '=', projectId)
    .select([
      'branch.expenditures.category',
      'branch.expenditures.description',
      'branch.expenditures.amount',
      'branch.expenditures.spent_on',
      'branch.users.name as entered_by_name',
    ])
    .execute();

  return {
    project: {
      project_id: project.project_id,
      name: project.name,
      description: project.description,
      total_budget: project.total_budget,
      start_date: project.start_date ? new Date(project.start_date as unknown as string) : null,
      end_date: project.end_date ? new Date(project.end_date as unknown as string) : null,
      currency: project.currency,
    },
    members: members.map((m) => ({
      name: m.name,
      email: m.email,
      role: m.role,
      hours: m.hours,
    })),
    donations: donations.map((d) => ({
      organization: d.organization,
      contact_name: d.contact_name,
      amount: d.amount,
      donated_at: d.donated_at ? new Date(d.donated_at as unknown as string) : null,
    })),
    expenditures: expenditures.map((e) => ({
      category: e.category,
      description: e.description,
      amount: e.amount,
      spent_on: new Date(e.spent_on as unknown as string),
      entered_by_name: e.entered_by_name ?? null,
    })),
  };
}

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(amount: string | null, currency: string | null): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  const sym = currency === 'USD' ? '$' : (currency ?? '');
  return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generatePdf(data: ReportData): Promise<Buffer> {
  const urlResolver = new URLResolver(require('fs'));
  const printer = new PdfPrinter(fonts, null, urlResolver);

  const content: Content[] = [
    { text: data.project.name, style: 'title' },
    {
      text: [
        data.project.start_date ? `${formatDate(data.project.start_date)} – ${formatDate(data.project.end_date)}` : '',
        data.project.total_budget ? `    |    Budget: ${formatCurrency(data.project.total_budget, data.project.currency)}` : '',
      ].filter(Boolean).join(''),
      style: 'subtitle',
    },
    { text: 'Description', style: 'sectionHeader' },
    { text: data.project.description, style: 'body', margin: [0, 0, 0, 16] },
  ];

  // Participants table
  content.push({ text: 'Project Participants', style: 'sectionHeader' });
  if (data.members.length === 0) {
    content.push({ text: 'No participants assigned.', style: 'body', margin: [0, 0, 0, 16] });
  } else {
    const memberRows: TableCell[][] = [
      [
        { text: 'Name', style: 'tableHeader' },
        { text: 'Email', style: 'tableHeader' },
        { text: 'Role', style: 'tableHeader' },
        { text: 'Hours', style: 'tableHeader' },
      ],
      ...data.members.map((m) => [
        m.name,
        m.email,
        m.role,
        m.hours ?? '—',
      ]),
    ];
    content.push({
      table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto'], body: memberRows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    } as Content);
  }

  // Donations table
  content.push({ text: 'Donations', style: 'sectionHeader' });
  if (data.donations.length === 0) {
    content.push({ text: 'No donations recorded.', style: 'body', margin: [0, 0, 0, 16] });
  } else {
    const totalDonations = data.donations.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const donationRows: TableCell[][] = [
      [
        { text: 'Donor Organization', style: 'tableHeader' },
        { text: 'Contact', style: 'tableHeader' },
        { text: 'Amount', style: 'tableHeader' },
        { text: 'Date', style: 'tableHeader' },
      ],
      ...data.donations.map((d) => [
        d.organization,
        d.contact_name ?? '—',
        formatCurrency(d.amount, data.project.currency),
        formatDate(d.donated_at),
      ]),
      [
        { text: 'Total', bold: true, colSpan: 2 }, {},
        { text: formatCurrency(totalDonations.toString(), data.project.currency), bold: true },
        '',
      ],
    ];
    content.push({
      table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto'], body: donationRows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    } as Content);
  }

  // Expenditures table
  content.push({ text: 'Expenditures', style: 'sectionHeader' });
  if (data.expenditures.length === 0) {
    content.push({ text: 'No expenditures recorded.', style: 'body', margin: [0, 0, 0, 16] });
  } else {
    const totalExpenses = data.expenditures.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const expenseRows: TableCell[][] = [
      [
        { text: 'Category', style: 'tableHeader' },
        { text: 'Description', style: 'tableHeader' },
        { text: 'Amount', style: 'tableHeader' },
        { text: 'Date', style: 'tableHeader' },
        { text: 'Entered By', style: 'tableHeader' },
      ],
      ...data.expenditures.map((e) => [
        e.category ?? '—',
        e.description ?? '—',
        formatCurrency(e.amount, data.project.currency),
        formatDate(e.spent_on),
        e.entered_by_name ?? '—',
      ]),
      [
        { text: 'Total', bold: true, colSpan: 2 }, {},
        { text: formatCurrency(totalExpenses.toString(), data.project.currency), bold: true },
        '', '',
      ],
    ];
    content.push({
      table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'], body: expenseRows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 16],
    } as Content);
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 11, color: '#666666', margin: [0, 0, 0, 20] },
      sectionHeader: { fontSize: 14, bold: true, margin: [0, 12, 0, 6], color: '#333333' },
      body: { fontSize: 10, lineHeight: 1.4 },
      tableHeader: { fontSize: 10, bold: true, color: '#333333' },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    footer: (currentPage: number, pageCount: number) => ({
      text: `Generated on ${new Date().toLocaleDateString('en-US')}  —  Page ${currentPage} of ${pageCount}`,
      alignment: 'center' as const,
      fontSize: 8,
      color: '#999999',
      margin: [0, 10, 0, 0],
    }),
  };

  const doc = await printer.createPdfKitDocument(docDefinition);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function generateDocx(data: ReportData): Promise<Buffer> {
  const makeHeaderRow = (headers: string[]) =>
    new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          }),
      ),
    });

  const makeDataRow = (cells: string[]) =>
    new TableRow({
      children: cells.map(
        (v) => new DocxTableCell({ children: [new Paragraph({ text: v })] }),
      ),
    });

  const makeTotalRow = (colSpan: number, totalCols: number, formattedTotal: string) => {
    const cells: DocxTableCell[] = [
      new DocxTableCell({
        columnSpan: colSpan,
        children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true })] })],
      }),
      new DocxTableCell({
        children: [new Paragraph({ children: [new TextRun({ text: formattedTotal, bold: true })] })],
      }),
    ];
    for (let i = colSpan + 1; i < totalCols; i++) {
      cells.push(new DocxTableCell({ children: [new Paragraph({})] }));
    }
    return new TableRow({ children: cells });
  };

  const sectionHeading = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_1 });

  const docChildren: (Paragraph | Table)[] = [];

  // Title
  docChildren.push(new Paragraph({ text: data.project.name, heading: HeadingLevel.TITLE }));

  // Subtitle
  const subtitleParts: string[] = [];
  if (data.project.start_date) {
    subtitleParts.push(`${formatDate(data.project.start_date)} – ${formatDate(data.project.end_date)}`);
  }
  if (data.project.total_budget) {
    subtitleParts.push(`Budget: ${formatCurrency(data.project.total_budget, data.project.currency)}`);
  }
  if (subtitleParts.length > 0) {
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: subtitleParts.join('    |    '), color: '666666', size: 22 })],
      }),
    );
  }

  // Description
  docChildren.push(new Paragraph({}));
  docChildren.push(sectionHeading('Description'));
  docChildren.push(new Paragraph({ text: data.project.description }));

  // Members
  docChildren.push(new Paragraph({}));
  docChildren.push(sectionHeading('Project Participants'));
  if (data.members.length === 0) {
    docChildren.push(new Paragraph({ text: 'No participants assigned.' }));
  } else {
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          makeHeaderRow(['Name', 'Email', 'Role', 'Hours']),
          ...data.members.map((m) => makeDataRow([m.name, m.email, m.role, m.hours ?? '—'])),
        ],
      }),
    );
  }

  // Donations
  docChildren.push(new Paragraph({}));
  docChildren.push(sectionHeading('Donations'));
  if (data.donations.length === 0) {
    docChildren.push(new Paragraph({ text: 'No donations recorded.' }));
  } else {
    const totalDonations = data.donations.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          makeHeaderRow(['Donor Organization', 'Contact', 'Amount', 'Date']),
          ...data.donations.map((d) =>
            makeDataRow([
              d.organization,
              d.contact_name ?? '—',
              formatCurrency(d.amount, data.project.currency),
              formatDate(d.donated_at),
            ]),
          ),
          makeTotalRow(2, 4, formatCurrency(totalDonations.toString(), data.project.currency)),
        ],
      }),
    );
  }

  // Expenditures
  docChildren.push(new Paragraph({}));
  docChildren.push(sectionHeading('Expenditures'));
  if (data.expenditures.length === 0) {
    docChildren.push(new Paragraph({ text: 'No expenditures recorded.' }));
  } else {
    const totalExpenses = data.expenditures.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          makeHeaderRow(['Category', 'Description', 'Amount', 'Date', 'Entered By']),
          ...data.expenditures.map((e) =>
            makeDataRow([
              e.category ?? '—',
              e.description ?? '—',
              formatCurrency(e.amount, data.project.currency),
              formatDate(e.spent_on),
              e.entered_by_name ?? '—',
            ]),
          ),
          makeTotalRow(2, 5, formatCurrency(totalExpenses.toString(), data.project.currency)),
        ],
      }),
    );
  }

  // Footer
  docChildren.push(new Paragraph({}));
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on ${new Date().toLocaleDateString('en-US')}`,
          color: '999999',
          size: 16,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  );

  const doc = new Document({ sections: [{ children: docChildren }] });
  return Packer.toBuffer(doc);
}

export async function uploadToS3(fileBuffer: Buffer, projectId: number, fileType: 'pdf' | 'docx'): Promise<string> {
  const bucketName = getBucketName();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `reports/${projectId}/${timestamp}.${fileType}`;
  const contentType = fileType === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    }),
  );

  return `https://${bucketName}.s3.amazonaws.com/${key}`;
}

export async function saveReportRecord(
  projectId: number,
  objectUrl: string,
  title: string,
): Promise<{ report_id: number; object_url: string }> {
  const row = await db
    .insertInto('branch.reports')
    .values({
      project_id: projectId,
      object_url: objectUrl,
      title,
    })
    .returning(['report_id', 'object_url'])
    .executeTakeFirstOrThrow();

  return { report_id: row.report_id, object_url: row.object_url };
}
