/**
 * Auto PC Assignment Utility
 * 
 * Automatically assigns a PC number to each browser tab/window.
 * - Tab 1 gets PC-01
 * - Tab 2 gets PC-02
 * - If Tab 1 closes and Tab 3 opens, Tab 3 gets PC-01 (reuses freed slot)
 * 
 * Uses localStorage to track which PCs are currently in use across all tabs.
 * Each PC assignment includes a timestamp to resolve conflicts.
 */

// Key for storing active PCs in localStorage
const ACTIVE_PCS_KEY = 'active_pcs';
const TAB_ID_KEY = 'tab_id';

// Generate a unique ID for this tab with timestamp for conflict resolution
function getOrCreateTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    // Include timestamp for priority ordering (earlier = higher priority)
    tabId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

// Get all active PCs from localStorage
function getActivePcs(): Record<string, { pc: string; tabId: string; timestamp: number }> {
  try {
    const data = localStorage.getItem(ACTIVE_PCS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Save active PCs to localStorage
function saveActivePcs(activePcs: Record<string, { pc: string; tabId: string; timestamp: number }>): void {
  localStorage.setItem(ACTIVE_PCS_KEY, JSON.stringify(activePcs));
  // Trigger storage event
  window.dispatchEvent(new Event('storage'));
}

// Find the lowest available PC number
function findLowestAvailablePc(activePcs: Record<string, { pc: string; tabId: string; timestamp: number }>): number {
  const usedPcs = Object.values(activePcs).map(entry => parseInt(entry.pc, 10));
  let pcNum = 1;
  
  // Find the first unused PC number
  while (usedPcs.includes(pcNum)) {
    pcNum++;
  }
  
  return pcNum;
}

// Get the next available PC number and assign it to this tab
export function assignPcToTab(): string {
  // Check if this tab already has a PC assigned
  const existingPc = sessionStorage.getItem('auto_assigned_pc');
  const tabId = getOrCreateTabId();
  
  if (existingPc) {
    console.log('[autoPc] 🖥️ Tab already has PC:', existingPc);
    // Verify it's still registered in localStorage
    const activePcs = getActivePcs();
    const entry = Object.values(activePcs).find(e => e.tabId === tabId);
    if (!entry || entry.pc !== existingPc) {
      // Re-register this PC
      const timestamp = parseInt(tabId.split('_')[0], 10);
      const key = `${existingPc}_${tabId}`;
      activePcs[key] = { pc: existingPc, tabId, timestamp };
      saveActivePcs(activePcs);
      console.log('[autoPc] 🔄 Re-registered PC-' + existingPc);
    }
    return existingPc;
  }

  // Try to claim a PC with retries
  for (let attempt = 0; attempt < 5; attempt++) {
    const activePcs = getActivePcs();
    
    // Check if this tab already has a PC registered (page refresh case)
    const existingEntry = Object.values(activePcs).find(e => e.tabId === tabId);
    if (existingEntry) {
      const pcNumber = existingEntry.pc;
      sessionStorage.setItem('auto_assigned_pc', pcNumber);
      sessionStorage.setItem('active_pc', pcNumber);
      console.log('[autoPc] 🔄 Restored PC-' + pcNumber + ' for this tab');
      return pcNumber;
    }
    
    // Find the lowest available PC number
    const pcNum = findLowestAvailablePc(activePcs);
    const pcNumber = pcNum.toString().padStart(2, '0');
    const timestamp = parseInt(tabId.split('_')[0], 10);
    const key = `${pcNumber}_${tabId}`;
    
    // Register this PC
    activePcs[key] = { pc: pcNumber, tabId, timestamp };
    saveActivePcs(activePcs);
    
    // Wait a bit for other tabs to register their claims
    const waitTime = 100 + (attempt * 50);
    const start = Date.now();
    while (Date.now() - start < waitTime) { /* wait */ }
    
    // Check for conflicts
    const verification = getActivePcs();
    const conflicts = Object.values(verification).filter(e => e.pc === pcNumber);
    
    if (conflicts.length === 1 && conflicts[0].tabId === tabId) {
      // Success - we're the only one with this PC
      sessionStorage.setItem('auto_assigned_pc', pcNumber);
      sessionStorage.setItem('active_pc', pcNumber);
      console.log('[autoPc] ✅ Successfully assigned PC-' + pcNumber);
      return pcNumber;
    } else if (conflicts.length > 1) {
      // Conflict - resolve by timestamp (earliest wins)
      conflicts.sort((a, b) => a.timestamp - b.timestamp);
      const winner = conflicts[0];
      
      if (winner.tabId === tabId) {
        // We won!
        sessionStorage.setItem('auto_assigned_pc', pcNumber);
        sessionStorage.setItem('active_pc', pcNumber);
        console.log('[autoPc] ✅ Won conflict resolution for PC-' + pcNumber);
        
        // Remove other claimants
        const updatedPcs = getActivePcs();
        conflicts.slice(1).forEach(loser => {
          const loserKey = `${loser.pc}_${loser.tabId}`;
          delete updatedPcs[loserKey];
        });
        saveActivePcs(updatedPcs);
        
        return pcNumber;
      } else {
        // We lost - remove our claim and try again
        const updatedPcs = getActivePcs();
        delete updatedPcs[key];
        saveActivePcs(updatedPcs);
        console.log('[autoPc] ⚠️ Lost conflict for PC-' + pcNumber + ', retrying...');
        
        // Add delay before retry
        const retryDelay = 50 + Math.random() * 100;
        const retryStart = Date.now();
        while (Date.now() - retryStart < retryDelay) { /* wait */ }
      }
    }
  }
  
  // Fallback
  const fallbackPc = '99';
  console.error('[autoPc] ❌ Failed to assign PC, using fallback');
  sessionStorage.setItem('auto_assigned_pc', fallbackPc);
  sessionStorage.setItem('active_pc', fallbackPc);
  return fallbackPc;
}

// Get the current tab's PC number
export function getTabPcNumber(): string {
  const pc = sessionStorage.getItem('auto_assigned_pc') || sessionStorage.getItem('active_pc');
  if (pc) {
    return pc;
  }
  
  // If not assigned yet, assign now
  return assignPcToTab();
}

// Reset all PC assignments (useful for testing or admin reset)
export function resetPcCounter(): void {
  localStorage.removeItem(ACTIVE_PCS_KEY);
  console.log('[autoPc] 🔄 All PC assignments reset');
}

// Release this tab's PC when tab closes
export function cleanupTabPc(): void {
  const pc = sessionStorage.getItem('auto_assigned_pc');
  if (pc) {
    const tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (tabId) {
      const activePcs = getActivePcs();
      // Remove all entries for this tab
      Object.keys(activePcs).forEach(key => {
        if (activePcs[key].tabId === tabId) {
          delete activePcs[key];
        }
      });
      saveActivePcs(activePcs);
      console.log('[autoPc] 🧹 Released PC-' + pc + ' (tab closing)');
    }
  }
}
