export interface CreateTenantInput {
    name: string;
    tenantCode: string;
    adminUserName: string;
    adminFullName: string;
    adminPassword: string;
}

export interface CreateTenantResult {
    tenantId: string;
    tenantCode: string;
}