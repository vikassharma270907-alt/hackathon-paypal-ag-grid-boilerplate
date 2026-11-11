'use client';

import { useState, useEffect } from 'react';
import {
  Network,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileText,
  DollarSign,
  Shield,
  Truck,
  Eye,
  Layers,
  Sparkles,
  Info,
  ExternalLink,
  ChevronRight,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { GraphNode, GraphEdge, TransactionEvidenceGraph } from '@/lib/evidence-graph';

export function EvidenceGraphWorkspace() {
  const [graphData, setGraphData] = useState<TransactionEvidenceGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'DISCREPANCIES' | 'VERIFIED'>('ALL');

  useEffect(() => {
    fetch('/api/evidence-graph')
      .then((res) => res.json())
      .then((data) => {
        setGraphData(data);
        if (data.nodes && data.nodes.length > 0) {
          // Select discrepancy node by default if present
          const disc = data.nodes.find((n: GraphNode) => n.status === 'DISCREPANCY');
          setSelectedNode(disc || data.nodes[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getNodeIcon = (type: GraphNode['type']) => {
    switch (type) {
      case 'PURCHASE_ORDER':
      case 'SUPPLIER_INVOICE':
      case 'INVOICE_LINE_ITEM':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'OCR_EXTRACTION':
      case 'GEMINI_INTERPRETATION':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      case 'DELIVERY_EVIDENCE':
        return <Truck className="w-4 h-4 text-emerald-400" />;
      case 'CHANNEL3_INTELLIGENCE':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'PAYPAL_AUTHORIZATION':
      case 'PAYPAL_CAPTURE':
        return <DollarSign className="w-4 h-4 text-cyan-400" />;
      case 'RISK_ANALYSIS':
      case 'PAYMENT_MANDATE':
      case 'HUMAN_APPROVAL':
        return <Shield className="w-4 h-4 text-indigo-400" />;
      default:
        return <Network className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: GraphNode['status']) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        );
      case 'DISCREPANCY':
        return (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Discrepancy
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800">
            <XCircle className="w-3 h-3" /> Blocked
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Pending
          </span>
        );
    }
  };

  const filteredNodes = graphData?.nodes.filter((n) => {
    if (filter === 'DISCREPANCIES') return n.status === 'DISCREPANCY';
    if (filter === 'VERIFIED') return n.status === 'VERIFIED';
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header with KPI cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Transaction Evidence Graph (Directed Acyclic Provenance DAG)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic cryptographic audit trail connecting POs, OCR tokens, Gemini extractions, Bounding Boxes, Carrier PODs, PayPal Auths, Mandates, and Captures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${filter === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              All Nodes ({graphData?.nodes.length || 0})
            </button>
            <button
              onClick={() => setFilter('DISCREPANCIES')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${filter === 'DISCREPANCIES' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Discrepancies ({graphData?.summary.discrepancyCount || 0})
            </button>
            <button
              onClick={() => setFilter('VERIFIED')}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${filter === 'VERIFIED' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Verified ({graphData?.summary.verifiedCount || 0})
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
          <span>Building relational evidence graph...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Interactive DAG Flow Map (8 cols) */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Evidence Provenance DAG</span>
              <span>Click any node to inspect raw evidence &amp; bounding box</span>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[640px] pr-1">
              {filteredNodes.map((node, index) => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`relative p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${
                        node.status === 'DISCREPANCY'
                          ? 'bg-amber-950/50 border-amber-700'
                          : 'bg-slate-900 border-slate-800'
                      }`}>
                        {getNodeIcon(node.type)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          <span>{node.label}</span>
                          {node.amount !== undefined && (
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              ${node.amount.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{node.sublabel}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(node.status)}
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isSelected ? 'rotate-90 text-blue-400' : ''}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Evidence & Discrepancy Drawer (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
              <span className="font-semibold uppercase tracking-wider text-slate-300">Evidence Provenance Inspector</span>
              {selectedNode && getStatusBadge(selectedNode.status)}
            </div>

            {selectedNode ? (
              <div className="space-y-4 text-xs">
                {/* Node Title */}
                <div>
                  <h3 className="text-base font-bold text-white">{selectedNode.label}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{selectedNode.sublabel}</p>
                </div>

                {/* Discrepancy Alert Card */}
                {selectedNode.discrepancyDetails && (
                  <div className="bg-amber-950/40 border border-amber-700/80 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Commercial Discrepancy Flagged</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Extracted Value:</span>
                        <span className="text-rose-400 font-bold">{selectedNode.discrepancyDetails.extractedValue}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Expected Value:</span>
                        <span className="text-emerald-400 font-bold">{selectedNode.discrepancyDetails.expectedValue}</span>
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1">
                      <div>
                        <span className="text-slate-400 font-semibold">Source Document: </span>
                        <span className="text-slate-200">{selectedNode.discrepancyDetails.sourceDocument}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Comparison Method: </span>
                        <span className="text-slate-200">{selectedNode.discrepancyDetails.comparisonMethod}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Why It Matters: </span>
                        <span className="text-amber-200">{selectedNode.discrepancyDetails.whyDiscrepancyMatters}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Recommended Resolution: </span>
                        <span className="text-emerald-300 font-medium">{selectedNode.discrepancyDetails.recommendedResolution}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bounding Box & Spatial Provenance Card */}
                {selectedNode.provenance ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-slate-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-blue-400" />
                        <span>LayoutLMv3 Spatial Grounding</span>
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        {Math.round((selectedNode.provenance.confidence || 0.95) * 100)}% Conf
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-500">File Name:</span>
                        <span className="font-mono text-slate-200">{selectedNode.provenance.fileName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Document Hash (SHA-256):</span>
                        <span className="font-mono text-slate-400">{selectedNode.provenance.sourceDocumentHash.slice(0, 16)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Page Number:</span>
                        <span className="font-mono text-slate-200">Page {selectedNode.provenance.pageNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Extraction Model:</span>
                        <span className="text-slate-200">{selectedNode.provenance.modelUsed}</span>
                      </div>
                    </div>

                    {/* Simulated Document Bounding Box Viewer */}
                    {selectedNode.provenance.boundingBox && (
                      <div className="mt-2 pt-2 border-t border-slate-800">
                        <span className="text-slate-400 text-[11px] block mb-1">Spatial Coordinates:</span>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 relative h-28 flex items-center justify-center overflow-hidden">
                          <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                          {/* Simulated mini page frame */}
                          <div className="w-44 h-24 bg-white/5 border border-slate-700 rounded relative p-1.5 flex flex-col justify-between">
                            <div className="w-16 h-1.5 bg-slate-600 rounded"></div>
                            <div className="w-24 h-1 bg-slate-700 rounded"></div>
                            {/* Bounding box highlight */}
                            <div
                              className="border border-blue-400 bg-blue-500/20 rounded px-1 py-0.5 text-[9px] font-mono text-blue-300 absolute"
                              style={{ right: '8px', bottom: '8px' }}
                            >
                              bbox (x:{selectedNode.provenance.boundingBox.x}, y:{selectedNode.provenance.boundingBox.y})
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-400 text-xs space-y-2">
                    <div className="font-semibold text-slate-300">Entity Details</div>
                    <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selectedNode.metadata || {}, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Channel3 Intelligence Note */}
                {selectedNode.type === 'CHANNEL3_INTELLIGENCE' && (
                  <div className="bg-purple-950/30 border border-purple-800/60 rounded-xl p-3 text-[11px] text-purple-300 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
                    <span>
                      Channel3 market prices are displayed strictly as external comparative intelligence, and do not constitute contractual proof of supplier price agreements.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-8 text-slate-500 text-xs">
                Select any node from the DAG to inspect its source provenance.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
