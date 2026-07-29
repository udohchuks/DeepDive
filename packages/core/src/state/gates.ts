import { PhaseId } from '../domain/types.js';
import { RubricVerdict } from '../domain/rubric.js';

export interface PhaseGate {
  phaseId: PhaseId;
  name: string;
  entryCriteria: string[];
  exitCriteria: string[];
}

export const PhaseGates: Record<PhaseId, PhaseGate> = {
  A: {
    phaseId: 'A',
    name: 'Ideation',
    entryCriteria: ['Project proposal submitted by student'],
    exitCriteria: ['Accepted Project Charter approved by rubric'],
  },
  B: {
    phaseId: 'B',
    name: 'System Design',
    entryCriteria: ['Accepted Project Charter present'],
    exitCriteria: ['System Design Document approved by rubric'],
  },
  'B.5': {
    phaseId: 'B.5',
    name: 'Learning Needs',
    entryCriteria: ['Approved SDD present'],
    exitCriteria: ['Concepts & learning needs co-selected'],
  },
  C: {
    phaseId: 'C',
    name: 'Module Plan',
    entryCriteria: ['Learning needs selected'],
    exitCriteria: ['Module decomposition & test obligations approved'],
  },
  D: {
    phaseId: 'D',
    name: 'Module Execution',
    entryCriteria: ['Approved module plan present'],
    exitCriteria: ['All modules implemented and tests green'],
  },
  E: {
    phaseId: 'E',
    name: 'Quizzes',
    entryCriteria: ['Module execution completed'],
    exitCriteria: ['Project comprehension check & concept drills passed'],
  },
  F: {
    phaseId: 'F',
    name: 'Completion',
    entryCriteria: ['Quizzes passed'],
    exitCriteria: ['Final portfolio record generated'],
  },
  'OB-A': {
    phaseId: 'OB-A',
    name: 'Contribution Intent & Repo Charter',
    entryCriteria: ['Target repo specified'],
    exitCriteria: ['Repo Learning Charter approved'],
  },
  'OB-B': {
    phaseId: 'OB-B',
    name: 'Reverse System Design',
    entryCriteria: ['Repo Learning Charter present'],
    exitCriteria: ['Reverse System Design Document approved with valid citations'],
  },
  'OB-C': {
    phaseId: 'OB-C',
    name: 'Reading Plan & Exercise Decomposition',
    entryCriteria: ['Approved RSDD present'],
    exitCriteria: ['Reading units topologically ordered'],
  },
  'OB-D': {
    phaseId: 'OB-D',
    name: 'Reading & Trace Execution Loop',
    entryCriteria: ['Reading plan present'],
    exitCriteria: ['All reading units verified and characterization tests green'],
  },
  'OB-E': {
    phaseId: 'OB-E',
    name: 'Contribution Path',
    entryCriteria: ['Trace loop completed'],
    exitCriteria: ['Contribution Design Doc approved & implementation complete'],
  },
  'OB-F': {
    phaseId: 'OB-F',
    name: 'Quizzes',
    entryCriteria: ['Contribution complete'],
    exitCriteria: ['Repo comprehension check & concept drills passed'],
  },
  'OB-G': {
    phaseId: 'OB-G',
    name: 'Completion',
    entryCriteria: ['Quizzes passed'],
    exitCriteria: ['Completion record generated'],
  },
};

export function evaluateGateExit(phaseId: PhaseId, verdict: RubricVerdict): boolean {
  if (PhaseGates[phaseId].phaseId !== phaseId) return false;
  return verdict.status === 'approved';
}
