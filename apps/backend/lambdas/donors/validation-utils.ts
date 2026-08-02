export interface DonorInput {
    organization: string;
    contactName?: string;
    contactEmail?: string;
}

export interface DonationInput {
    donorId: number;
    projectId: number;
    amount: number;
    donatedAt?: string;
}

export class DonorValidationUtils {
    static validateOrganization(organization: unknown): string | Error {
        if (organization === undefined || organization === null || organization === '') {
            return new Error("Organization is required");
        }

        if (typeof organization !== 'string' || organization.trim() === '') {
            return new Error("Organization must be a non-empty string");
        }

        return organization;
    }

    static validateContactName(contactName: unknown): string | Error | undefined {
        if (contactName === undefined || contactName === null) {
            return undefined;
        }
        if (typeof contactName !== 'string') {
            return new Error("Contact name must be a string");
        }
        return contactName;
    }

    static validateContactEmail(contactEmail: unknown): string | undefined | Error {
        if (contactEmail === undefined || contactEmail === null) {
            return undefined;
        }

        if (typeof contactEmail !== 'string' || contactEmail.trim() === '') {
            return new Error('contact_email must be a non-empty string');
        }

        // Basic format check — not exhaustive, just catches obvious junk
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
            return new Error('contact_email must be a valid email address');
        }

        return contactEmail;
    }

    static validateDonorInput(body: Record<string, unknown>): DonorInput | Error {
        const organization = this.validateOrganization(body.organization);
        if (organization instanceof Error) {
            return organization;
        }

        const contactName = this.validateContactName(body.contact_name);
        if (contactName instanceof Error) {
            return contactName;
        }

        const contactEmail = this.validateContactEmail(body.contact_email);
        if (contactEmail instanceof Error) {
            return contactEmail;
        }

        return { organization, contactName, contactEmail };
    }

}


export class DonationValidationUtils {
    static validateDonorId(donorId: unknown): number | Error {
        if (donorId === undefined || donorId === null || donorId === '') {
            return new Error("donorId is required");
        }

        if (typeof donorId !== 'number' || !Number.isInteger(donorId) || donorId <= 0) {
            return new Error("donorId must be a positive integer");
        }

        return donorId;
    }

    static validateProjectId(projectId: unknown): number | Error {
        if (projectId === undefined || projectId === null || projectId === '') {
            return new Error("projectId is required");
        }

        if (typeof projectId !== 'number' || !Number.isInteger(projectId) || projectId <= 0) {
            return new Error("projectId must be a positive integer");
        }

        return projectId;
    }

    static validateAmount(amount: unknown): number | Error {
        if (amount === undefined || amount === null || amount === '') {
            return new Error("amount is required");
        }

        if (typeof amount !== 'number') {
            return new Error("amount must be a number");
        }

        if (amount < 0) {
            return new Error("amount must be non-negative");
        }

        return amount;
    }

    static validateDonatedAt(donatedAt: unknown): string | undefined | Error {
        if (donatedAt === undefined || donatedAt === null) {
            return undefined;
        }

        if (typeof donatedAt !== 'string' || isNaN(Date.parse(donatedAt))) {
            return new Error('donatedAt must be a valid ISO date string');
        }

        return donatedAt;
    }

    static validateDonationInput(body: Record<string, unknown>): DonationInput | Error {
        const donorId = this.validateDonorId(body.donorId);
        if (donorId instanceof Error) {
            return donorId;
        }

        const projectId = this.validateProjectId(body.projectId);
        if (projectId instanceof Error) {
            return projectId;
        }

        const amount = this.validateAmount(body.amount);
        if (amount instanceof Error) {
            return amount;
        }

        const donatedAt = this.validateDonatedAt(body.donatedAt);
        if (donatedAt instanceof Error) {
            return donatedAt;
        }

        return { donorId, projectId, amount, donatedAt };
    }

}
