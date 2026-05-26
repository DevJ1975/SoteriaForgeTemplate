import type { ScormRuntimeState } from '@soteria-forge/shared'

type CommitRuntime = (state: ScormRuntimeState) => Promise<void> | void

export function installScormRuntimeApi(initialState: ScormRuntimeState, commitRuntime: CommitRuntime) {
  const state: ScormRuntimeState = { ...initialState }
  let initialized = false
  let lastError = '0'

  function setValue(element: string, value: string) {
    if (element === 'cmi.core.lesson_status') state.lessonStatus = value
    if (element === 'cmi.completion_status') state.completionStatus = value
    if (element === 'cmi.success_status') state.successStatus = value
    if (element === 'cmi.core.score.raw' || element === 'cmi.score.raw') state.scoreRaw = Number(value)
    if (element === 'cmi.core.score.min' || element === 'cmi.score.min') state.scoreMin = Number(value)
    if (element === 'cmi.core.score.max' || element === 'cmi.score.max') state.scoreMax = Number(value)
    if (element === 'cmi.suspend_data') state.suspendData = value
    if (element === 'cmi.core.lesson_location' || element === 'cmi.location') state.location = value
    if (element === 'cmi.core.session_time' || element === 'cmi.session_time') state.sessionTime = value
    return 'true'
  }

  function getValue(element: string) {
    if (element === 'cmi.core.lesson_status') return state.lessonStatus ?? 'not attempted'
    if (element === 'cmi.completion_status') return state.completionStatus ?? 'unknown'
    if (element === 'cmi.success_status') return state.successStatus ?? 'unknown'
    if (element === 'cmi.suspend_data') return state.suspendData ?? ''
    if (element === 'cmi.core.lesson_location' || element === 'cmi.location') return state.location ?? ''
    return ''
  }

  const scorm12 = {
    LMSInitialize: () => {
      initialized = true
      return 'true'
    },
    LMSFinish: () => {
      void commitRuntime(state)
      initialized = false
      return 'true'
    },
    LMSGetValue: getValue,
    LMSSetValue: setValue,
    LMSCommit: () => {
      void commitRuntime(state)
      return 'true'
    },
    LMSGetLastError: () => lastError,
    LMSGetErrorString: (code: string) => (code === '0' ? 'No error' : 'Runtime error'),
    LMSGetDiagnostic: () => (initialized ? 'Initialized' : 'Not initialized'),
  }

  const scorm2004 = {
    Initialize: scorm12.LMSInitialize,
    Terminate: scorm12.LMSFinish,
    GetValue: scorm12.LMSGetValue,
    SetValue: scorm12.LMSSetValue,
    Commit: scorm12.LMSCommit,
    GetLastError: () => lastError,
    GetErrorString: scorm12.LMSGetErrorString,
    GetDiagnostic: scorm12.LMSGetDiagnostic,
  }

  Object.assign(window, {
    API: scorm12,
    API_1484_11: scorm2004,
  })

  return () => {
    delete (window as typeof window & { API?: unknown }).API
    delete (window as typeof window & { API_1484_11?: unknown }).API_1484_11
  }
}
