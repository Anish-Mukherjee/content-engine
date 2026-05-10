// Test helper: idempotently seed the XeroGravity org + site so getDefaultSiteId() resolves.
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { _resetDefaultSiteIdCache } from '../db/queries';
import { organization, site } from '../db/schema';

const ORG_SLUG = 'xerogravity';
const SITE_SLUG = 'xerogravity';

export async function seedXgSite(): Promise<{ orgId: string; siteId: string }> {
  let [orgRow] = await db().select().from(organization).where(eq(organization.slug, ORG_SLUG)).limit(1);
  if (!orgRow) {
    const [created] = await db().insert(organization).values({
      id: crypto.randomUUID(),
      name: 'XeroGravity',
      slug: ORG_SLUG,
    }).returning();
    if (!created) throw new Error('failed to seed XG org');
    orgRow = created;
  }

  let [siteRow] = await db().select().from(site).where(eq(site.organizationId, orgRow.id)).limit(1);
  if (!siteRow) {
    const [created] = await db().insert(site).values({
      organizationId: orgRow.id,
      name: 'XeroGravity',
      slug: SITE_SLUG,
      categories: [],
    }).returning();
    if (!created) throw new Error('failed to seed XG site');
    siteRow = created;
  }

  _resetDefaultSiteIdCache();
  return { orgId: orgRow.id, siteId: siteRow.id };
}
