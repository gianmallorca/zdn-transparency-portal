/**
 * This portal's configuration: the only file a fork needs to edit.
 * What each field means: src/config.ts. Generate one with `npm run setup`;
 * check it against the live API with `npm run check`.
 *
 * Province of Zamboanga del Norte (Region IX). The Budget API lists four DPWH
 * district engineering offices for its three legislative districts. The 4th
 * District Engineering Office is published on the 3rd legislative district
 * (there is no 4th district id). The place name brings in lines from all four
 * programs whose title names Zamboanga del Norte (Central Office projects,
 * farm-to-market roads, health facilities, irrigation).
 */
import { defineConfig } from './src/config';

export default defineConfig({
  id: 'zamboanga-del-norte',
  kind: 'province',
  name: 'Province of Zamboanga del Norte',
  shortName: 'Zamboanga del Norte',
  operator: { name: 'BetterGov.ph', url: 'https://bettergov.ph' },
  scope: {
    offices: [
      'Zamboanga del Norte 1st District Engineering Office',
      'Zamboanga del Norte 2nd District Engineering Office',
      'Zamboanga del Norte 3rd District Engineering Office',
      'Zamboanga del Norte 4th District Engineering Office',
    ],
    places: [{ label: 'Zamboanga del Norte', q: 'Zamboanga del Norte', region: 'IX' }],
    districts: [
      'leg:zamboanga-del-norte:1st',
      'leg:zamboanga-del-norte:2nd',
      'leg:zamboanga-del-norte:3rd',
    ],
    exclude: [],
  },
  reporting: { enabled: false },
});
