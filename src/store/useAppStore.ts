import { create } from "zustand";
import type {
  Account,
  Ring,
  CaseRun,
  GraphEdge,
  ValidationResult,
  Settings,
  InterventionAction,
  MitigationSummary,
} from "@/lib/types";

import {
  sampleAccounts,
  sampleRings,
  sampleEdges,
  sampleCases,
} from "@/lib/mockData";

interface AppState {
  hasAnalysis: boolean;
  cases: CaseRun[];
  currentCase: CaseRun | null;
  accounts: Account[];
  rings: Ring[];
  edges: GraphEdge[];

  uploadedFile: File | null;
  isProcessing: boolean;
  processingTime: number | null;
  validationResult: ValidationResult | null;

  selectedAccountId: string | null;
  selectedRingId: string | null;
  ringFocusMode: boolean;
  showWhyPanel: boolean;
  whyAccountId: string | null;

  settings: Settings;

  interventionScenario: InterventionAction[];
  mitigationSummary: MitigationSummary | null;

  setUploadedFile: (file: File | null) => void;
  validateFile: () => void;
  runAnalysis: () => Promise<void>;
  selectAccount: (id: string | null) => void;
  selectRing: (id: string | null) => void;
  setRingFocusMode: (active: boolean) => void;
  openWhyPanel: (accountId: string) => void;
  closeWhyPanel: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  resetAnalysis: () => void;
  loadSampleData: () => void;

  addIntervention: (action: InterventionAction) => void;
  removeIntervention: (index: number) => void;
  previewIntervention: () => void;
  applyIntervention: () => void;
  resetIntervention: () => void;
}

const defaultSettings: Settings = {
  nodeLimit: 2000,
  defaultLayout: "force",
  defaultEdgeLabel: "none",
  aggregateEdges: true,
  cycleLengthMin: 3,
  cycleLengthMax: 5,
  fanThreshold: 10,
  timeWindowHours: 72,
  shellTxMin: 2,
  shellTxMax: 3,
  confidenceWeight: 0.5,
};

export const useAppStore = create<AppState>((set, get) => ({
  hasAnalysis: false,
  cases: [],
  currentCase: null,
  accounts: [],
  rings: [],
  edges: [],

  uploadedFile: null,
  isProcessing: false,
  processingTime: null,
  validationResult: null,

  selectedAccountId: null,
  selectedRingId: null,
  ringFocusMode: false,
  showWhyPanel: false,
  whyAccountId: null,

  settings: { ...defaultSettings },

  interventionScenario: [],
  mitigationSummary: null,

  setUploadedFile: (file) =>
    set({ uploadedFile: file, validationResult: null }),

  validateFile: () => {
    const file = get().uploadedFile;
    if (!file) return;

    set({
      validationResult: {
        columnsDetected: true,
        timestampValid: true,
        amountNumeric: true,
        amountPositive: true,
        duplicateTxCount: 0,
        rowsParsed: 0,
        invalidRows: 0,
        columns: ["transaction_id", "sender_id", "receiver_id", "amount", "timestamp"],
      },
    });
  },

  // 🚀 REAL BACKEND CALL
  runAnalysis: async () => {
   
      const { uploadedFile, cases } = get();
  if (!uploadedFile) return;

  set({ isProcessing: true });

  const start = performance.now();

  try {
    const formData = new FormData();
    formData.append("file", uploadedFile);

    const response = await fetch(
      "https://mcbackend-production.up.railway.app/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) throw new Error("Backend failed");

    const data = await response.json();

    const accounts: Account[] = data.suspicious_accounts.map((acc: any) => ({
      id: acc.account_id,
      riskScore: acc.suspicion_score,
      confidence: Math.min(100, acc.suspicion_score + 10),
      ringId: null,
      inDegree: 0,
      outDegree: 0,
      uniqueCounterparties: 0,
      velocityLabel:
        acc.suspicion_score >= 70
          ? "high"
          : acc.suspicion_score >= 40
          ? "medium"
          : "low",
      patterns: acc.detected_patterns,
      totalIn: 0,
      totalOut: 0,
      txCount: 0,
      sccId: null,
      kCoreLevel: 0,
      centralityScore: 0,
      scoreBreakdown: [],
    }));

    const elapsed = ((performance.now() - start) / 1000).toFixed(2);

    const newCase: CaseRun = {
      id: `CASE-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      fileName: uploadedFile.name,
      datasetSize: 0,
      nodeCount: accounts.length,
      edgeCount: 0,
      txCount: 0,
      suspiciousCount: accounts.length,
      ringCount: 0,
      processingTime: parseFloat(elapsed),
      riskExposure:
        accounts.length > 0
          ? Math.max(...accounts.map((a) => a.riskScore))
          : 0,
      timeWindow: "",
      topPatterns: [],
      riskLevel:
        accounts.length > 5
          ? "high"
          : accounts.length > 2
          ? "medium"
          : "low",
    };

    set({
      accounts,
      rings: [],
      edges: [],
      currentCase: newCase,
      cases: [newCase, ...cases],
      hasAnalysis: true,
      isProcessing: false,
      processingTime: parseFloat(elapsed),
    });

  } catch (error) {
    console.error(error);
    set({ isProcessing: false });
    alert("Backend connection failed.");
  }
  
  },

  selectAccount: (id) => set({ selectedAccountId: id }),
  selectRing: (id) => set({ selectedRingId: id }),
  setRingFocusMode: (active) => set({ ringFocusMode: active }),
  openWhyPanel: (id) => set({ showWhyPanel: true, whyAccountId: id }),
  closeWhyPanel: () => set({ showWhyPanel: false, whyAccountId: null }),

  updateSettings: (s) =>
    set((state) => ({ settings: { ...state.settings, ...s } })),

  resetAnalysis: () =>
    set({
      hasAnalysis: false,
      currentCase: null,
      accounts: [],
      rings: [],
      edges: [],
      uploadedFile: null,
      processingTime: null,
      validationResult: null,
      selectedAccountId: null,
      selectedRingId: null,
      ringFocusMode: false,
    }),

  loadSampleData: () => {
    const c = sampleCases[0];
    set({
      hasAnalysis: true,
      currentCase: c,
      cases: sampleCases,
      accounts: sampleAccounts,
      rings: sampleRings,
      edges: sampleEdges,
      processingTime: c.processingTime,
      mitigationSummary: null,
      interventionScenario: [],
    });
  },

  addIntervention: (action) =>
    set((state) => ({
      interventionScenario: [...state.interventionScenario, action],
    })),

  removeIntervention: (index) =>
    set((state) => ({
      interventionScenario: state.interventionScenario.filter(
        (_, i) => i !== index
      ),
    })),

  previewIntervention: () => {
    const { currentCase, interventionScenario } = get();
    if (!currentCase) return;

    const reductionFactor = interventionScenario.length * 0.12;
    const flowReduction = interventionScenario.length * 450000;

    set({
      mitigationSummary: {
        before: {
          riskScore: currentCase.riskExposure,
          suspiciousCount: currentCase.suspiciousCount,
          ringCount: currentCase.ringCount,
          flow: 12450000,
          disruption: 0,
        },
        after: {
          riskScore: Math.max(
            15,
            currentCase.riskExposure - Math.round(reductionFactor * 60)
          ),
          suspiciousCount: Math.max(
            0,
            currentCase.suspiciousCount - interventionScenario.length * 2
          ),
          ringCount: Math.max(
            0,
            currentCase.ringCount -
              Math.round(interventionScenario.length * 0.8)
          ),
          flow: Math.max(0, 12450000 - flowReduction),
          disruption: Math.min(100, interventionScenario.length * 15),
        },
      },
    });
  },

  applyIntervention: () => {
    const { mitigationSummary, currentCase } = get();
    if (!mitigationSummary || !currentCase) return;

    const updatedCase = {
      ...currentCase,
      riskExposure: mitigationSummary.after.riskScore,
      suspiciousCount: mitigationSummary.after.suspiciousCount,
      ringCount: mitigationSummary.after.ringCount,
    };

    set({
      currentCase: updatedCase,
      mitigationSummary: null,
      interventionScenario: [],
    });
  },

  resetIntervention: () =>
    set({ interventionScenario: [], mitigationSummary: null }),
}));
