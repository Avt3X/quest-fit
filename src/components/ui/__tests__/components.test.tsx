import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import { Button } from '../Button';
import { Chip, SegmentedControl } from '../Chip';
import { EmptyState, ErrorState } from '../States';
import { TextField } from '../TextField';

describe('Button', () => {
  it('announces its label and fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Join challenge" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Join challenge' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and busy while loading so double taps cannot submit twice', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save activity" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Save activity' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('form controls', () => {
  it('TextField shows errors and toggles password visibility', async () => {
    await renderWithProviders(<TextField label="Password" value="secret1" secureToggle error="Too short" />);
    expect(screen.getByText('Too short')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
  });

  it('SegmentedControl reports selection changes and exposes selected state', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SegmentedControl
        options={[
          { value: 'metric', label: 'Kilometres' },
          { value: 'imperial', label: 'Miles' },
        ]}
        value="metric"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Kilometres' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Miles' })).not.toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Miles' }));
    expect(onChange).toHaveBeenCalledWith('imperial');
  });

  it('Chip is a toggle button when pressable', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Chip label="Run" selected onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Run' });
    expect(chip).toBeSelected();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });
});

describe('states', () => {
  it('EmptyState renders its call to action', async () => {
    const onAction = jest.fn();
    await renderWithProviders(<EmptyState icon="run" title="No activities yet" message="Record one" actionLabel="Record" onAction={onAction} />);
    expect(screen.getByText('No activities yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Record' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('ErrorState is announced as an alert with retry', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(<ErrorState message="Offline" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
