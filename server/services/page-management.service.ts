/**
 * Page Management Service
 * 
 * Manages UI pages and auto-generates policies for them.
 * 
 * When a new page is created:
 * 1. Page record is created in UiPage table
 * 2. Policies are auto-generated based on policyPrefix
 * 3. Standard policies: {prefix}.view, {prefix}.create, {prefix}.update, {prefix}.delete
 * 4. Custom actions can be added via actions field
 */

import { prisma } from "../lib/prisma";

export interface PageAction {
  name: string; // e.g., "assign", "close", "approve"
  policyKey: string; // e.g., "help_tickets.assign"
  description?: string;
}

export interface CreatePageInput {
  pageKey: string; // Unique identifier
  pageName: string; // Display name
  path: string; // Route path
  policyPrefix: string; // Policy prefix (e.g., "help_tickets")
  autoGenerate?: boolean; // Auto-generate policies (default: true)
  icon?: string;
  order?: number;
  actions?: PageAction[]; // Custom actions beyond CRUD
}

/**
 * Locked allowlist of policies
 */
const ALLOWED_POLICIES = new Set([
  "dashboard.view",
  "roles-assigned.view",
  "employees.view",
  "attendance.history.view",
  "staff-sales.view",
  "sales-staff.view",
  "admin.panel",
  "admin.routing.view",
  "admin.master-settings.view",
  "integrations.fetched-data.view",
  "trainings.view",
  "requests.view",
  "salary.view",
  "settings.view",
  "assigned-manager.view",
  "help_tickets.view",
  "help_tickets.create",
  "help_tickets.update",
  "help_tickets.assign",
  "help_tickets.close",
  "no_policy.view",
]);

/**
 * Generate policy key from prefix and action
 */
function generatePolicyKey(prefix: string, action: string): string {
  return `${prefix}.${action}`;
}

/**
 * Generate all policies for a page
 */
function generatePoliciesForPage(
  pageName: string,
  policyPrefix: string,
  customActions?: PageAction[]
): Array<{ key: string; description: string; category: string }> {
  const policies: Array<{ key: string; description: string; category: string }> = [];

  const viewKey = generatePolicyKey(policyPrefix, "view");
  if (ALLOWED_POLICIES.has(viewKey)) {
    policies.push({
      key: viewKey,
      description: `View ${pageName}`,
      category: policyPrefix.split("_")[0] || policyPrefix,
    });
  } else {
    throw new Error(`Policy ${viewKey} is not in the allowed list`);
  }

  // Add custom actions
  if (customActions) {
    customActions.forEach((action) => {
      if (!ALLOWED_POLICIES.has(action.policyKey)) {
        throw new Error(`Policy ${action.policyKey} is not in the allowed list`);
      }
      policies.push({
        key: action.policyKey,
        description: action.description || `${action.name} ${pageName}`,
        category: policyPrefix.split("_")[0] || policyPrefix,
      });
    });
  }

  return policies;
}

/**
 * Create a new UI page and auto-generate its policies
 */
export async function createPage(input: CreatePageInput): Promise<{
  page: any;
  policiesCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let policiesCreated = 0;

  try {
    // Check if page already exists
    const existingPage = await prisma.uiPage.findUnique({
      where: { pageKey: input.pageKey },
    });

    if (existingPage) {
      throw new Error(`Page with key "${input.pageKey}" already exists`);
    }

    // Check if path already exists
    const existingPath = await prisma.uiPage.findUnique({
      where: { path: input.path },
    });

    if (existingPath) {
      throw new Error(`Page with path "${input.path}" already exists`);
    }

    // Create page and policies in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the page
      const page = await tx.uiPage.create({
        data: {
          pageKey: input.pageKey,
          pageName: input.pageName,
          path: input.path,
          policyPrefix: input.policyPrefix,
          autoGenerate: input.autoGenerate ?? true,
          icon: input.icon,
          order: input.order ?? 0,
          isActive: true,
        },
      });

      // Generate and create policies if auto-generate is enabled
      if (input.autoGenerate !== false) {
        const policies = generatePoliciesForPage(
          input.pageName,
          input.policyPrefix,
          input.actions
        );

        for (const policy of policies) {
          try {
            // Check if policy already exists
            const existing = await tx.policy.findUnique({
              where: { key: policy.key },
            });

            if (!existing) {
              await tx.policy.create({
                data: {
                  key: policy.key,
                  description: policy.description,
                  category: policy.category,
                  pageId: page.id,
                  isActive: true,
                },
              });
              policiesCreated++;
            } else {
              // Update existing policy to link to page
              await tx.policy.update({
                where: { key: policy.key },
                data: { pageId: page.id },
              });
            }
          } catch (error: any) {
            errors.push(`Failed to create policy ${policy.key}: ${error.message}`);
          }
        }
      }

      return { page, policiesCreated };
    });

    console.log(
      `[Page Management] ✅ Created page "${input.pageName}" with ${policiesCreated} policies`
    );

    return {
      page: result.page,
      policiesCreated: result.policiesCreated,
      errors,
    };
  } catch (error: any) {
    console.error(`[Page Management] ❌ Failed to create page:`, error);
    throw error;
  }
}

/**
 * Update an existing page
 */
export async function updatePage(
  pageId: string,
  input: Partial<CreatePageInput>
): Promise<any> {
  try {
    const page = await prisma.uiPage.findUnique({
      where: { id: pageId },
      include: { policies: true },
    });

    if (!page) {
      throw new Error(`Page with id "${pageId}" not found`);
    }

    // Update page fields
    const updatedPage = await prisma.uiPage.update({
      where: { id: pageId },
      data: {
        ...(input.pageName && { pageName: input.pageName }),
        ...(input.path && { path: input.path }),
        ...(input.policyPrefix && { policyPrefix: input.policyPrefix }),
        ...(input.autoGenerate !== undefined && { autoGenerate: input.autoGenerate }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.order !== undefined && { order: input.order }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    // If policyPrefix changed and autoGenerate is true, regenerate policies
    if (
      input.policyPrefix &&
      input.policyPrefix !== page.policyPrefix &&
      (input.autoGenerate !== false && page.autoGenerate)
    ) {
      // Delete old policies linked to this page
      await prisma.policy.deleteMany({
        where: { pageId: pageId },
      });

      // Generate new policies
      const policies = generatePoliciesForPage(
        updatedPage.pageName,
        input.policyPrefix,
        input.actions
      );

      for (const policy of policies) {
        await prisma.policy.create({
          data: {
            key: policy.key,
            description: policy.description,
            category: policy.category,
            pageId: updatedPage.id,
            isActive: true,
          },
        });
      }
    }

    return updatedPage;
  } catch (error: any) {
    console.error(`[Page Management] ❌ Failed to update page:`, error);
    throw error;
  }
}

/**
 * Get all pages with their policies
 */
export async function getAllPages(): Promise<any[]> {
  return prisma.uiPage.findMany({
    include: {
      policies: {
        where: { isActive: true },
        orderBy: { key: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });
}

/**
 * Get a single page by ID
 */
export async function getPageById(pageId: string): Promise<any | null> {
  return prisma.uiPage.findUnique({
    where: { id: pageId },
    include: {
      policies: {
        where: { isActive: true },
        orderBy: { key: "asc" },
      },
    },
  });
}

/**
 * Get a page by path
 */
export async function getPageByPath(path: string): Promise<any | null> {
  return prisma.uiPage.findUnique({
    where: { path },
    include: {
      policies: {
        where: { isActive: true },
        orderBy: { key: "asc" },
      },
    },
  });
}

/**
 * Delete a page (soft delete by setting isActive to false)
 */
export async function deletePage(pageId: string): Promise<void> {
  await prisma.uiPage.update({
    where: { id: pageId },
    data: { isActive: false },
  });
}

/**
 * Sync pages from NAV_CONFIG to database
 * This is called on server startup to ensure all pages exist
 */
export async function syncPagesFromNavConfig(): Promise<{
  created: number;
  existing: number;
  errors: string[];
}> {
  // Import NAV_CONFIG structure (we'll need to duplicate it here for server-side)
  // In production, you might want to read from a shared config file
  
  const navConfigPages: CreatePageInput[] = [
    {
      pageKey: "dashboard",
      pageName: "Dashboard",
      path: "/",
      policyPrefix: "dashboard",
      actions: [], // Dashboard only needs view
    },
    {
      pageKey: "help-tickets",
      pageName: "Help Tickets",
      path: "/help-tickets",
      policyPrefix: "help_tickets",
      actions: [
        { name: "assign", policyKey: "help_tickets.assign", description: "Assign Help Tickets" },
        { name: "close", policyKey: "help_tickets.close", description: "Close Help Tickets" },
      ],
    },
    // Add more pages as needed
  ];

  const result = {
    created: 0,
    existing: 0,
    errors: [] as string[],
  };

  for (const pageInput of navConfigPages) {
    try {
      const existing = await prisma.uiPage.findUnique({
        where: { pageKey: pageInput.pageKey },
      });

      if (existing) {
        result.existing++;
        continue;
      }

      await createPage(pageInput);
      result.created++;
    } catch (error: any) {
      result.errors.push(`Failed to sync page ${pageInput.pageKey}: ${error.message}`);
    }
  }

  return result;
}
