import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-2' });
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS ?? 'no-reply@branch.org';

export async function sendExpenseStatusEmail(opts: {
    to: string;
    submitterName: string;
    status: 'approved' | 'denied';
    amount: number;
    category: string | null;
    adminNotes?: string | null;
  }) {
    const { subject, body } = buildCopy(opts);
    await ses.send(new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: { ToAddresses: [opts.to] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    }));
  }

  function buildCopy({
    submitterName,
    status,
    amount,
    category,
    adminNotes,
  }: {
    submitterName: string;
    status: 'approved' | 'denied';
    amount: number;
    category: string | null;
    adminNotes?: string | null;
  }): { subject: string; body: string } {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  
    const categoryLine = category ? ` (${category})` : '';
    const isApproved = status === 'approved';
  
    const subject = `Your expense of ${formattedAmount} was ${isApproved ? 'approved' : 'not approved'}`;
  
    const statusLine = isApproved
      ? `Your expense of ${formattedAmount}${categoryLine} has been approved.`
      : `Your expense of ${formattedAmount}${categoryLine} was not approved.`;
  
    const notesLine = isApproved
      ? (adminNotes ? `Note from the reviewer: ${adminNotes}` : null)
      : (adminNotes
          ? `Reason: ${adminNotes}`
          : 'No additional reason was provided. Reach out to your project admin if you have questions.');
  
    const body = [
      `Hi ${submitterName},`,
      '',
      statusLine,
      ...(notesLine ? ['', notesLine] : []),
      '',
      'You can view the full details in Branch.',
      '',
      '— The Branch Team',
    ].join('\n');
  
    return { subject, body };
  }