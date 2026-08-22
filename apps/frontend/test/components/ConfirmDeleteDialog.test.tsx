import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../utils';
import ConfirmDeleteDialog from '@/app/components/ConfirmDeleteDialog';

describe('ConfirmDeleteDialog', () => {
    it('does not call onConfirm until the confirm button is pressed', async () => {
        const onConfirm = jest.fn();
        render(
            <ConfirmDeleteDialog
                open
                onClose={jest.fn()}
                onConfirm={onConfirm}
                title="Delete Thing"
                itemName="Thing One"
            />,
        );

        expect(await screen.findByText('Thing One')).toBeInTheDocument();
        expect(onConfirm).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('closes after a successful confirm', async () => {
        const onClose = jest.fn();
        render(
            <ConfirmDeleteDialog
                open
                onClose={onClose}
                onConfirm={async () => undefined}
                title="Delete Thing"
                itemName="Thing One"
            />,
        );

        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('surfaces the failure and stays open when the delete rejects', async () => {
        const onClose = jest.fn();
        render(
            <ConfirmDeleteDialog
                open
                onClose={onClose}
                onConfirm={async () => {
                    throw new Error('Donor is still referenced');
                }}
                title="Delete Thing"
                itemName="Thing One"
            />,
        );

        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Donor is still referenced',
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps confirm disabled until the name is retyped', async () => {
        const onConfirm = jest.fn();
        render(
            <ConfirmDeleteDialog
                open
                onClose={jest.fn()}
                onConfirm={onConfirm}
                title="Delete Project"
                itemName="Policy Advocacy Program"
                requireTypedConfirmation
            />,
        );

        const confirm = await screen.findByRole('button', { name: 'Delete' });
        expect(confirm).toBeDisabled();

        await userEvent.type(
            screen.getByPlaceholderText('Policy Advocacy Program'),
            'Policy Advocacy Program',
        );

        await waitFor(() => expect(confirm).toBeEnabled());
        await userEvent.click(confirm);
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });
});
