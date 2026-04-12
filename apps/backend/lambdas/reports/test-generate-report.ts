import { config } from 'dotenv';
config();

import { fetchReportData, generatePdf, uploadToS3, saveReportRecord } from './report-service';

async function main() {
  const projectId = Number(process.argv[2] || 1);
  console.log(`Generating report for project ${projectId}...`);

  const data = await fetchReportData(projectId);
  if (!data) {
    console.error(`Project ${projectId} not found`);
    process.exit(1);
  }

  console.log(`  Project: ${data.project.name}`);
  console.log(`  Members: ${data.members.length}`);
  console.log(`  Donations: ${data.donations.length}`);
  console.log(`  Expenditures: ${data.expenditures.length}`);

  console.log('Generating PDF...');
  const pdfBuffer = await generatePdf(data);
  console.log(`  PDF size: ${pdfBuffer.length} bytes`);

  console.log('Uploading to S3...');
  const objectUrl = await uploadToS3(pdfBuffer, projectId);
  console.log(`  URL: ${objectUrl}`);

  console.log('Saving report record...');
  const record = await saveReportRecord(projectId, objectUrl);
  console.log(`  Report ID: ${record.report_id}`);

  console.log('\nDone! Report uploaded successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
