/**
 * src/lib/linkedin/extractCompanyEmployees.ts (NEW FILE)
 * 
 * Extract employees from LinkedIn company /people/ tab using Puppeteer
 * Cost: FREE (Puppeteer only, no API calls)
 * Speed: ~30-45 seconds per company
 */

import type { Page } from 'puppeteer';
import { withBrowserPage, humanPause, loadServiceCookies } from '@/lib/browser/puppeteerClient';

export interface LinkedInEmployee {
  name: string;
  title: string;
  profileUrl: string;
  inferredEmail?: string;  // Generated: firstname.lastname@domain
}

/**
 * Extract employees from LinkedIn company /people/ page
 * @param companySlag e.g., "heliguy" (from linkedin.com/company/{slug})
 * @param domain e.g., "heliguy.com" (for email inference)
 * @param limit max employees to extract (default 5)
 * @returns Array of employees with inferred emails
 */
export async function extractCompanyEmployees(
  companySlug: string,
  domain: string | null,
  limit = 5,
): Promise<LinkedInEmployee[]> {
  const employees: LinkedInEmployee[] = [];

  await withBrowserPage(async (page: Page) => {
    try {
      // Load LinkedIn cookies
      await loadServiceCookies(page, 'linkedin');
      await humanPause(1000, 2000);

      // Navigate to company /people/ page
      const peopleUrl = `https://www.linkedin.com/company/${companySlug}/people/`;
      console.log(`[LinkedIn] Navigating to ${peopleUrl}`);
      
      await page.goto(peopleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanPause(2000, 3000);

      // Scroll to load more employees
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        await humanPause(1500, 2500);
      }

      // Extract employee data
      const rawEmployees = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[data-item-id]'));
        return items.slice(0, 20).map((item) => {
          const nameEl = item.querySelector('[data-test-profile-card-name]');
          const titleEl = item.querySelector('[data-test-profile-card-title]');
          const linkEl = item.closest('a[href*="/in/"]');

          const name = nameEl?.textContent?.trim() || '';
          const title = titleEl?.textContent?.trim() || '';
          const profileUrl = linkEl?.getAttribute('href') || '';

          return { name, title, profileUrl };
        });
      });

      // Filter and process employees
      for (const emp of rawEmployees) {
        if (!emp.name || !emp.title) continue;

        const employee: LinkedInEmployee = {
          name: emp.name,
          title: emp.title,
          profileUrl: emp.profileUrl,
        };

        // Infer email if domain available
        if (domain && emp.name) {
          const [first, ...last] = emp.name.toLowerCase().split(/\s+/);
          const lastName = last.join('');
          employee.inferredEmail = `${first}.${lastName}@${domain}`;
        }

        employees.push(employee);

        if (employees.length >= limit) break;
      }

      console.log(`[LinkedIn] Extracted ${employees.length} employees from ${companySlug}`);
    } catch (err) {
      console.error(`[LinkedIn] Error extracting employees:`, err instanceof Error ? err.message : err);
    }
  });

  return employees;
}

/**
 * Integration point in /api/contacts
 * Usage:
 * 
 * // If Apollo returns < 3 contacts and company has LinkedIn:
 * if (apolloContacts.length < 3 && company.linkedin_url) {
 *   const linkedinSlug = company.linkedin_url.split('/company/')[1]?.replace('/', '');
 *   const linkedinEmployees = await extractCompanyEmployees(linkedinSlug, domain, 3);
 *   
 *   for (const emp of linkedinEmployees) {
 *     const isDuplicate = contacts.some(c => c.name?.toLowerCase() === emp.name.toLowerCase());
 *     if (isDuplicate) continue;
 *     
 *     contacts.push({
 *       name: emp.name,
 *       title: emp.title,
 *       organization: org,
 *       email: null,  // Will be inferred
 *       emailStatus: 'inferred',
 *       emailSource: null,
 *       linkedinUrl: emp.profileUrl,
 *       isFromArticle: false,
 *     });
 *   }
 * }
 */
