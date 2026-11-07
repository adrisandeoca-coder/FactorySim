import { applyOverrides } from './scenarioModelBuilder';
import { extractKpiValue } from './sweepService';
import type { FactoryModel, KPIData, SimulationOptions, ScenarioParameterOverride } from '../types';

export interface OptimizationConfig {
  parameters: OptimizationParameter[];
  objective: {
    kpiPath: string;        // e.g., 'oee.overall', 'throughput.total'
    direction: 'maximize' | 'minimize';
  };
  constraints?: OptimizationConstraint[];
  // GA settings
  populationSize?: number;   // default 20
  generations?: number;      // default 15
  mutationRate?: number;     // default 0.2
  crossoverRate?: number;    // default 0.7
  eliteCount?: number;       // default 2
  // Simulation settings
  baseOptions: SimulationOptions;
}

export interface OptimizationConstraint {
  kpiPath: string;
  operator: '>=' | '<=' | '==';
  value: number;
}

export interface OptimizationParameter {
  entityType: ScenarioParameterOverride['entityType'];
  entityId: string;
  entityName: string;
  parameter: string;
  parameterLabel: string;
  min: number;
  max: number;
  step?: number;
  isInteger?: boolean;
}

export interface OptimizationResult {
  bestParams: Record<string, number>;
  bestFitness: number;
  bestKpis: KPIData;
  generations: GenerationResult[];
  totalSimulations: number;
  elapsedMs: number;
}

export interface GenerationResult {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestParams: Record<string, number>;
}

interface Individual {
  genes: number[];          // normalized [0,1] parameter values
  fitness: number;
  kpis?: KPIData;
  feasible: boolean;
}

function paramKey(p: OptimizationParameter): string {
  return `${p.entityId}.${p.parameter}`;
}

function decodeGenes(genes: number[], parameters: OptimizationParameter[]): Record<string, number> {
  const result: Record<string, number> = {};
  parameters.forEach((p, i) => {
    let val = p.min + genes[i] * (p.max - p.min);
    if (p.isInteger || p.parameter === 'capacity' || p.parameter === 'batchSize') {
      val = Math.round(val);
    }
    if (p.step) {
      val = Math.round(val / p.step) * p.step;
    }
    result[paramKey(p)] = Math.max(p.min, Math.min(p.max, val));
  });
  return result;
}

function buildOverrides(
  parameters: OptimizationParameter[],
  decodedParams: Record<string, number>
): ScenarioParameterOverride[] {
  return parameters.map((p) => ({
    entityType: p.entityType,
    entityId: p.entityId,
    entityName: p.entityName,
    parameter: p.parameter,
    originalValue: p.min,
    overrideValue: decodedParams[paramKey(p)],
  }));
}

function tournamentSelect(pop: Individual[], size: number): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < size; i++) {
    const candidate = pop[Math.floor(Math.random() * pop.length)];
    if (!best || candidate.fitness > best.fitness) best = candidate;
  }
  return best!;
}

export async function runOptimization(
  model: FactoryModel,
  config: OptimizationConfig,
  onProgress?: (gen: number, totalGens: number, best: number) => void,
  cancelToken?: { cancelled: boolean }
): Promise<OptimizationResult> {
  const {
    parameters,
    objective,
    constraints = [],
    populationSize = 20,
    generations = 15,
    mutationRate = 0.2,
    crossoverRate = 0.7,
    eliteCount = 2,
    baseOptions,
  } = config;

  const startTime = Date.now();
  let totalSims = 0;
  const genResults: GenerationResult[] = [];

  // Helper: evaluate individual
  async function evaluate(individual: Individual): Promise<void> {
    const decoded = decodeGenes(individual.genes, parameters);
    const overrides = buildOverrides(parameters, decoded);
    const modifiedModel = applyOverrides(model, overrides);

    try {
      const result = await window.factorySim!.simulation!.runSimulation(
        modifiedModel,
        baseOptions
      );
      const kpis = result.kpis;
      individual.kpis = kpis;

      // Extract fitness
      const rawFitness = extractKpiValue(kpis, objective.kpiPath);
      individual.fitness = objective.direction === 'maximize' ? rawFitness : -rawFitness;

      // Check constraints
      individual.feasible = constraints.every((c) => {
        const val = extractKpiValue(kpis, c.kpiPath);
        switch (c.operator) {
          case '>=': return val >= c.value;
          case '<=': return val <= c.value;
          case '==': return Math.abs(val - c.value) < 0.001;
          default: return true;
        }
      });

      // Penalize infeasible solutions
      if (!individual.feasible) {
        individual.fitness -= 1000;
      }

      totalSims++;
    } catch {
      individual.fitness = -Infinity;
      individual.feasible = false;
    }
  }

  // Initialize population with random genes [0,1]
  let population: Individual[] = Array.from({ length: populationSize }, () => ({
    genes: parameters.map(() => Math.random()),
    fitness: -Infinity,
    feasible: false,
  }));

  // Evaluate initial population
  for (const ind of population) {
    if (cancelToken?.cancelled) break;
    await evaluate(ind);
  }

  // Evolution loop
  for (let gen = 0; gen < generations; gen++) {
    if (cancelToken?.cancelled) break;

    // Sort by fitness (descending)
    population.sort((a, b) => b.fitness - a.fitness);

    // Record generation stats
    const bestInd = population[0];
    const finiteIndividuals = population.filter((i) => isFinite(i.fitness));
    const avgFit = finiteIndividuals.length > 0
      ? finiteIndividuals.reduce((s, i) => s + i.fitness, 0) / finiteIndividuals.length
      : 0;

    genResults.push({
      generation: gen,
      bestFitness: objective.direction === 'maximize' ? bestInd.fitness : -bestInd.fitness,
      avgFitness: objective.direction === 'maximize' ? avgFit : -avgFit,
      bestParams: decodeGenes(bestInd.genes, parameters),
    });

    onProgress?.(
      gen + 1,
      generations,
      objective.direction === 'maximize' ? bestInd.fitness : -bestInd.fitness
    );

    // Selection + crossover + mutation
    const newPop: Individual[] = [];

    // Elitism: keep top N
    for (let i = 0; i < eliteCount && i < population.length; i++) {
      newPop.push({ ...population[i], genes: [...population[i].genes] });
    }

    // Fill rest with offspring
    while (newPop.length < populationSize) {
      const parent1 = tournamentSelect(population, 3);
      const parent2 = tournamentSelect(population, 3);

      let childGenes: number[];
      if (Math.random() < crossoverRate) {
        // Uniform crossover
        childGenes = parent1.genes.map((g, i) =>
          Math.random() < 0.5 ? g : parent2.genes[i]
        );
      } else {
        childGenes = [...parent1.genes];
      }

      // Mutation: Gaussian perturbation
      childGenes = childGenes.map((g) => {
        if (Math.random() < mutationRate) {
          return Math.max(0, Math.min(1, g + (Math.random() - 0.5) * 0.3));
        }
        return g;
      });

      newPop.push({ genes: childGenes, fitness: -Infinity, feasible: false });
    }

    // Evaluate new individuals (skip elites that were already evaluated)
    for (let i = eliteCount; i < newPop.length; i++) {
      if (cancelToken?.cancelled) break;
      await evaluate(newPop[i]);
    }

    population = newPop;
  }

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);
  const best = population[0];
  const bestParams = decodeGenes(best.genes, parameters);

  return {
    bestParams,
    bestFitness: objective.direction === 'maximize' ? best.fitness : -best.fitness,
    bestKpis: best.kpis!,
    generations: genResults,
    totalSimulations: totalSims,
    elapsedMs: Date.now() - startTime,
  };
}
