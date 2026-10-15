import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KpiCard } from '../kpi-card';
import { Wallet } from 'lucide-react';

describe('KpiCard Color Logic', () => {
  it('should apply text-success when colorBySign is true and value is positive', () => {
    const { container } = render(
      <KpiCard 
        label="Test Positive" 
        value={100} 
        prevValue={50} 
        type="currency" 
        icon={Wallet} 
        colorBySign={true} 
      />
    );
    const valueElement = container.querySelector('.font-bold.font-data');
    expect(valueElement?.className).toContain('text-success');
  });

  it('should apply text-red when colorBySign is true and value is negative', () => {
    const { container } = render(
      <KpiCard 
        label="Test Negative" 
        value={-100} 
        prevValue={50} 
        type="currency" 
        icon={Wallet} 
        colorBySign={true} 
      />
    );
    const valueElement = container.querySelector('.font-bold.font-data');
    expect(valueElement?.className).toContain('text-red');
  });

  it('should apply text-foreground when colorBySign is true and value is zero', () => {
    const { container } = render(
      <KpiCard 
        label="Test Zero" 
        value={0} 
        prevValue={0} 
        type="currency" 
        icon={Wallet} 
        colorBySign={true} 
      />
    );
    const valueElement = container.querySelector('.font-bold.font-data');
    expect(valueElement?.className).toContain('text-foreground');
  });

  it('should apply text-foreground when colorBySign is false regardless of value', () => {
    const { container } = render(
      <KpiCard 
        label="Test Neutral" 
        value={100} 
        prevValue={50} 
        type="currency" 
        icon={Wallet} 
        colorBySign={false} 
      />
    );
    const valueElement = container.querySelector('.font-bold.font-data');
    expect(valueElement?.className).toContain('text-foreground');
  });
});

describe('VariationBadge Color Logic in KpiCard', () => {
  it('should apply text-success to variation badge when variation is positive', () => {
    const { container } = render(
      <KpiCard 
        label="Test Var Positive" 
        value={100} 
        prevValue={50} 
        type="currency" 
        icon={Wallet} 
      />
    );
    const badge = container.querySelector('span[class*="text-success"]');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('text-success');
  });

  it('should apply text-red to variation badge when variation is negative', () => {
    const { container } = render(
      <KpiCard 
        label="Test Var Negative" 
        value={50} 
        prevValue={100} 
        type="currency" 
        icon={Wallet} 
      />
    );
    const badge = container.querySelector('span[class*="text-red"]');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('text-red');
  });
});
