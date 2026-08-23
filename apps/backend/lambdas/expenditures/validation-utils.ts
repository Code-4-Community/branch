export const EXPENDITURE_STATUSES = ['approved', 'pending', 'denied', 'needs_more_info'] as const;
export type ExpenditureStatus = typeof EXPENDITURE_STATUSES[number];

export interface ExpenditureInput {
    projectID: number;
    amount: number;
    category?: string;
    description?: string;
    status: ExpenditureStatus;
    receiptUrl?: string;
    spentOn?: string;
}

/** The subset of an expenditure its author may revise. */
export interface ExpenditureUpdate {
    amount?: number;
    category?: string;
    description?: string;
    receiptUrl?: string;
    spentOn?: string;
}

export class ExpenditureValidationUtils {
    static validateProjectId(projectID: unknown): number | Error {
        if (projectID === undefined || projectID === null || projectID === '') {
            return new Error('projectID is required');
        }

        if (typeof projectID !== 'number' || !Number.isInteger(projectID)) {
            return new Error('projectID must be an integer');
        }

        return projectID;
    }

    static validateAmount(amount: unknown): number | Error {
        if (amount === undefined || amount === null || amount === '') {
            return new Error('amount is required');
        }

        if (typeof amount !== 'number') {
            return new Error('amount must be a number');
        }

        if (amount < 0) {
            return new Error('amount must be non-negative');
        }

        return amount;
    }

    static validateCategory(category: unknown): string | undefined | Error {
        if (category === undefined || category === null) {
            return undefined;
        }

        if (typeof category !== 'string' || category.trim() === '') {
            return new Error('category must be a non-empty string');
        }

        return category;
    }

    static validateDescription(description: unknown): string | undefined | Error {
        if (description === undefined || description === null) {
            return undefined;
        }

        if (typeof description !== 'string' || description.trim() === '') {
            return new Error('description must be a non-empty string');
        }

        return description;
    }

    static validateStatus(status: unknown): ExpenditureStatus | Error {
        if (status === undefined || status === null) {
            return 'pending';
        }

        if (typeof status !== 'string' || !EXPENDITURE_STATUSES.includes(status as ExpenditureStatus)) {
            return new Error(`status must be one of: ${EXPENDITURE_STATUSES.join(', ')}`);
        }

        return status as ExpenditureStatus;
    }

    static validateApprovalStatus(status: unknown): ExpenditureStatus | Error {
        if (status === undefined || status === null || status === '') {
            return new Error('status is required');
        }

        if (typeof status !== 'string' || !EXPENDITURE_STATUSES.includes(status as ExpenditureStatus)) {
            return new Error(`status must be one of: ${EXPENDITURE_STATUSES.join(', ')}`);
        }

        return status as ExpenditureStatus;
    }

    static validateAdminNotes(adminNotes: unknown): string | undefined | Error {
        if (adminNotes === undefined || adminNotes === null) {
            return undefined;
        }

        if (typeof adminNotes !== 'string' || adminNotes.trim() === '') {
            return new Error('adminNotes must be a non-empty string');
        }

        return adminNotes;
    }

    static validateReceiptUrl(receiptUrl: unknown): string | undefined | Error {
        if (receiptUrl === undefined || receiptUrl === null) {
            return undefined;
        }

        if (typeof receiptUrl !== 'string' || receiptUrl.trim() === '') {
            return new Error('receipt_url must be a non-empty string');
        }

        return receiptUrl;
    }

    static validateSpentOn(spentOn: unknown): string | undefined | Error {
        if (spentOn === undefined || spentOn === null) {
            return undefined;
        }

        if (typeof spentOn !== 'string' || isNaN(Date.parse(spentOn))) {
            return new Error('spentOn must be a valid ISO date string');
        }

        return spentOn;
    }

    /**
     * PATCH /expenditures/{id}. Every field is optional, but an empty patch is
     * rejected rather than silently succeeding.
     *
     * `status` and `adminNotes` are absent on purpose: they are admin-only and
     * live on PATCH /expenditures/{id}/status, which carries the
     * `expense:review` permission. Accepting them here would let an author
     * approve their own expense.
     */
    static validateExpenditureUpdate(body: Record<string, unknown>): ExpenditureUpdate | Error {
        const update: ExpenditureUpdate = {};

        if (body.amount !== undefined) {
            const amount = this.validateAmount(body.amount);
            if (amount instanceof Error) return amount;
            update.amount = amount;
        }

        if (body.category !== undefined) {
            const category = this.validateCategory(body.category);
            if (category instanceof Error) return category;
            update.category = category;
        }

        if (body.description !== undefined) {
            const description = this.validateDescription(body.description);
            if (description instanceof Error) return description;
            update.description = description;
        }

        const rawReceipt = body.receiptUrl ?? body.receipt_url;
        if (rawReceipt !== undefined) {
            const receiptUrl = this.validateReceiptUrl(rawReceipt);
            if (receiptUrl instanceof Error) return receiptUrl;
            update.receiptUrl = receiptUrl;
        }

        if (body.spentOn !== undefined) {
            const spentOn = this.validateSpentOn(body.spentOn);
            if (spentOn instanceof Error) return spentOn;
            update.spentOn = spentOn;
        }

        if (body.status !== undefined || body.adminNotes !== undefined) {
            return new Error('status and adminNotes are changed through PATCH /expenditures/{id}/status');
        }

        if (Object.keys(update).length === 0) {
            return new Error('No editable fields supplied');
        }

        return update;
    }

    static validateExpenditureInput(body: Record<string, unknown>): ExpenditureInput | Error {
        // Validate required fields
        const projectID = this.validateProjectId(body.projectID);
        if (projectID instanceof Error) {
            return projectID;
        }

        const amount = this.validateAmount(body.amount);
        if (amount instanceof Error) {
            return amount;
        }

        // Validate optional fields
        const category = this.validateCategory(body.category);
        if (category instanceof Error) {
            return category;
        }

        const description = this.validateDescription(body.description);
        if (description instanceof Error) {
            return description;
        }

        const status = this.validateStatus(body.status);
        if (status instanceof Error) {
            return status;
        }

        // Callers send camelCase; `receipt_url` is still accepted for older clients.
        const receiptUrl = this.validateReceiptUrl(body.receiptUrl ?? body.receipt_url);
        if (receiptUrl instanceof Error) {
            return receiptUrl;
        }

        const spentOn = this.validateSpentOn(body.spentOn);
        if (spentOn instanceof Error) {
            return spentOn;
        }

        return {
            projectID,
            amount,
            category,
            description,
            status,
            receiptUrl,
            spentOn,
        };
    }
}