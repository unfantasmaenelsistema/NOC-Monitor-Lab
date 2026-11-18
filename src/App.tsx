import { useEffect, useMemo, useState } from 'react';
import { ChaosInjectorModal } from './components/ChaosInjectorModal';
import { DashboardNocView } from './components/DashboardNocView';
import { HostInventoryView } from './components/HostInventoryView';
import { LabModeView } from './components/LabModeView';
import { LatestDataDrawer } from './components/LatestDataDrawer';
import { MaintenanceView } from './components/MaintenanceView';
import { MibSnmpConsoleView } from './components/MibSnmpConsoleView';
import { NocGuideModal } from './components/NocGuideModal';
import { ProblemsConsoleView } from './components/ProblemsConsoleView';
import { ShiftReportModal } from './components/ShiftReportModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { TriggerEngineView } from './components/TriggerEngineView';
import { useNocStore } from './state/useNocStore';
import { NavSection } from './types/noc';

const TAB_KEYS: Record<string, NavSection> = {
  '1': 'dashboard',
  '2': 'inventory',
  '3': 'mib_explorer',
  '4': 'triggers',
  '5': 'problems',
  '6': 'maintenance',
  '7': 'lab_mode',
};

export default function App() {
  const { state, actions } = useNocStore();
  const [chaosModalOpen, setChaosModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  // Global keyboard shortcuts for live NOC demos & rapid navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        setChaosModalOpen(false);
        setReportModalOpen(false);
        setGuideModalOpen(false);
        actions.selectHost(null);
        return;
      }

      if (TAB_KEYS[e.key]) {
        actions.setActiveTab(TAB_KEYS[e.key]);
        return;
      }

      if (e.key.toLowerCase() === 'p') {
        actions.setSimulationSpeed(state.simulationSpeed === 0 ? 1 : 0);
        return;
      }

      if (e.key.toLowerCase() === 'c') {
        setChaosModalOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, state.simulationSpeed]);

  const selectedHost = useMemo(
    () => state.hosts.find((h) => h.id === state.selectedHostId) ?? null,
    [state.hosts, state.selectedHostId]
  );

  const activeProblemCount = useMemo(
    () => state.problems.filter((p) => !p.resolved).length,
    [state.problems]
  );

  const maintenanceCount = useMemo(
    () => state.hosts.filter((h) => h.status === 'MAINTENANCE').length,
    [state.hosts]
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col lg:flex-row">
      <Sidebar
        activeTab={state.activeTab}
        onSelectTab={actions.setActiveTab}
        activeProblemCount={activeProblemCount}
        maintenanceCount={maintenanceCount}
        nocXp={state.nocXp}
        slaScore={state.slaScore}
        onOpenGuide={() => setGuideModalOpen(true)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          hosts={state.hosts}
          problems={state.problems}
          simulationSpeed={state.simulationSpeed}
          onChangeSpeed={actions.setSimulationSpeed}
          onOpenChaosModal={() => setChaosModalOpen(true)}
          onRecoverAll={actions.recoverAll}
          onOpenProblems={() => actions.setActiveTab('problems')}
          onOpenReport={() => setReportModalOpen(true)}
        />

        <main className="flex-1 p-5 overflow-y-auto">
          {state.activeTab === 'dashboard' && (
            <DashboardNocView
              hosts={state.hosts}
              problems={state.problems}
              telemetryFeed={state.telemetryFeed}
              selectedHostId={state.selectedHostId}
              onSelectHost={actions.selectHost}
              onNavigateToProblems={() => actions.setActiveTab('problems')}
              onExecuteNow={actions.executeNow}
            />
          )}

          {state.activeTab === 'inventory' && (
            <HostInventoryView
              hosts={state.hosts}
              onSelectHost={actions.selectHost}
              onExecuteNow={actions.executeNow}
              onUpsertHost={actions.upsertHost}
              onDeleteHost={actions.deleteHost}
            />
          )}

          {state.activeTab === 'mib_explorer' && (
            <MibSnmpConsoleView
              hosts={state.hosts}
              trapLog={state.trapLog}
              onAddCustomSnmpItem={actions.addCustomSnmpItem}
              onApplySnmpSetMutation={actions.applySnmpSetMutation}
              onEmitSnmpTrap={actions.emitSnmpTrap}
              onClearTrapLog={actions.clearTrapLog}
              onSelectHostForLatestData={actions.selectHost}
              onExecuteNow={actions.executeNow}
              onSnmpActivity={actions.recordSnmpActivity}
            />
          )}

          {state.activeTab === 'triggers' && (
            <TriggerEngineView
              hosts={state.hosts}
              triggers={state.triggers}
              wanFlapSimulation={state.wanFlapSimulation}
              onToggleTrigger={actions.toggleTrigger}
              onUpsertTrigger={actions.upsertTrigger}
              onDeleteTrigger={actions.deleteTrigger}
              onFixAntiPattern={actions.fixAntiPatternTrigger}
              onToggleWanFlap={actions.toggleWanFlapSimulation}
              onInjectHostAnomaly={(hostId, kind) => actions.injectChaos(hostId, kind)}
              onRecoverHost={actions.recoverHost}
            />
          )}

          {state.activeTab === 'problems' && (
            <ProblemsConsoleView
              hosts={state.hosts}
              problems={state.problems}
              triggers={state.triggers}
              onSelectHost={actions.selectHost}
              onAckProblem={actions.acknowledgeProblem}
              onResolveProblem={actions.resolveProblem}
              onTriageProblem={actions.triageProblem}
              onFixAntiPatternTrigger={actions.fixAntiPatternTrigger}
              onToggleTrigger={actions.toggleTrigger}
              onRunDiagnosticRecovery={actions.runDiagnosticRecovery}
              onNavigateToTriggers={() => actions.setActiveTab('triggers')}
            />
          )}

          {state.activeTab === 'maintenance' && (
            <MaintenanceView
              hosts={state.hosts}
              windows={state.maintenanceWindows}
              slaScore={state.slaScore}
              onCreateWindow={actions.createMaintenanceWindow}
              onSetWindowStatus={actions.setMaintenanceStatus}
              onDeleteWindow={actions.deleteMaintenanceWindow}
              onSimulateCriticalReboot={actions.simulateCriticalReboot}
              onRecoverHost={actions.recoverHost}
              onSelectHost={actions.selectHost}
              onOpenProblems={() => actions.setActiveTab('problems')}
            />
          )}

          {state.activeTab === 'lab_mode' && (
            <LabModeView
              state={state}
              onLaunchMission={actions.launchMission}
              onRunMission4Upgrade={actions.runMission4Upgrade}
              onResetFactory={actions.resetFactory}
              onOpenShiftReport={() => setReportModalOpen(true)}
            />
          )}
        </main>
      </div>

      <LatestDataDrawer
        host={selectedHost}
        onClose={() => actions.selectHost(null)}
        onExecuteNow={actions.executeNow}
        onInjectAnomaly={(hostId, kind) => actions.injectChaos(hostId, kind)}
        onRecoverHost={actions.recoverHost}
        onToggleMaintenance={(hostId) => actions.toggleMaintenance(hostId)}
        onRemoveCustomSnmpItem={actions.removeCustomSnmpItem}
      />

      <ChaosInjectorModal
        open={chaosModalOpen}
        hosts={state.hosts}
        chaosCount={state.chaosCount}
        onClose={() => setChaosModalOpen(false)}
        onInjectScenario={actions.injectChaosScenario}
        onRecoverAll={actions.recoverAll}
      />

      <ShiftReportModal
        open={reportModalOpen}
        state={state}
        onClose={() => setReportModalOpen(false)}
      />

      <NocGuideModal open={guideModalOpen} onClose={() => setGuideModalOpen(false)} />
    </div>
  );
}
