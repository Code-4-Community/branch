import { render, screen } from '../utils';
import ExpensesBarChart from '@/app/components/ExpensesBarChart';

describe('ExpensesBarChart', () => {
  it('labels every other month, as the design does', () => {
    render(<ExpensesBarChart year={2026} expenses={[]} />);

    for (const shown of ['Jan', 'March', 'May', 'July', 'Sept', 'Nov']) {
      expect(screen.getByText(shown)).toBeInTheDocument();
    }
    for (const hidden of ['Feb', 'April', 'June', 'Dec']) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('rounds the axis up to readable ticks above the tallest column', () => {
    render(
      <ExpensesBarChart
        year={2026}
        expenses={[
          { month: '2026-03', category: 'General', amount: 5000 },
          { month: '2026-03', category: 'Travel', amount: 2300 },
        ]}
      />,
    );

    for (const tick of ['0', '2,000', '4,000', '6,000', '8,000']) {
      expect(screen.getByText(tick)).toBeInTheDocument();
    }
  });

  it('always lists the four designed categories, even with no data', () => {
    render(<ExpensesBarChart year={2026} expenses={[]} />);

    for (const label of [
      'General',
      'Travel',
      'Travel Foreign',
      'Visitor/Honorarium',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('folds a spacing variant onto the category the design named', () => {
    // The expenses form writes "Visitor / Honorarium"; the design's legend says
    // "Visitor/Honorarium". Treating them as two categories would double-count
    // the band and colour half of it with a fallback.
    render(
      <ExpensesBarChart
        year={2026}
        expenses={[
          { month: '2026-02', category: 'Visitor / Honorarium', amount: 500 },
        ]}
      />,
    );

    expect(screen.getByText('Visitor/Honorarium')).toBeInTheDocument();
    expect(screen.queryByText('Visitor / Honorarium')).not.toBeInTheDocument();
  });

  it('keeps categories the database holds but the design never named', () => {
    // expenditures.category is free text, so dropping unknown values would make
    // the columns disagree with the Total Spent figure.
    render(
      <ExpensesBarChart
        year={2026}
        expenses={[{ month: '2026-02', category: 'Equipment', amount: 500 }]}
      />,
    );

    expect(screen.getByText('Equipment')).toBeInTheDocument();
  });

  it('ignores months belonging to another year', () => {
    const { container } = render(
      <ExpensesBarChart
        year={2026}
        expenses={[{ month: '2025-04', category: 'General', amount: 9999 }]}
      />,
    );

    // Nothing from 2025 should size the axis.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(container.querySelectorAll('[style*="background-color"]').length).toBe(
      // legend swatches only, no column segments
      4,
    );
  });
});
