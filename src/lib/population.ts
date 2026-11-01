import { POPULATION_CITATION, POPULATION_SOURCE, PROVINCE_POPULATION, TOWN_POPULATION } from '../data/population-psa-2020';
import { php, phpFull } from './format';
import type { TownId } from './towns';

export { POPULATION_CITATION, POPULATION_SOURCE, PROVINCE_POPULATION };

export function townPopulation(townId: TownId): number | null {
  return TOWN_POPULATION[townId] ?? null;
}

export function perResident(amount: number | null | undefined, population: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount) || !population || population <= 0) return null;
  return amount / population;
}

/** Friendly line + exact figure beneath. */
export function perResidentCopy(
  amount: number | null | undefined,
  population: number | null | undefined,
): { friendly: string; exact: string } | null {
  const per = perResident(amount, population);
  if (per == null || amount == null || population == null) return null;
  return {
    friendly: `${php(per)} per resident`,
    exact: `${phpFull(amount)} ÷ ${population.toLocaleString('en-US')} people (PSA 2020)`,
  };
}
