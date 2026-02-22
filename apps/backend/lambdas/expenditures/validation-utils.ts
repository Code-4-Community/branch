export interface ExpenditureInput {
    projectID: number;
    amount: number;
    category?: string;
    description?: string;
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

    static validateSpentOn(spentOn: unknown): string | undefined | Error {
        if (spentOn === undefined || spentOn === null) {
            return undefined;
        }

        if (typeof spentOn !== 'string' || isNaN(Date.parse(spentOn))) {
            return new Error('spentOn must be a valid ISO date string');
        }

        return spentOn;
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

        const spentOn = this.validateSpentOn(body.spentOn);
        if (spentOn instanceof Error) {
            return spentOn;
        }

        return {
            projectID,
            amount,
            category,
            description,
            spentOn,
        };
    }
}