import type { AuthLocationCode, AuthLoginPreference } from './authKeys'
import {
  clearDeviceAuthPreference,
  loadIsSharedDevice,
  loadLastLocation,
  loadLoginPreference,
  saveIsSharedDevice,
  saveLastLocation,
  saveLoginPreference,
} from './authKeys'

export function getDeviceLoginPreference(): AuthLoginPreference | null {
  return loadLoginPreference()
}

export function getDeviceLastLocation(): AuthLocationCode | null {
  return loadLastLocation()
}

export function getDeviceIsSharedDevice(): boolean {
  return loadIsSharedDevice()
}

export function setDeviceLoginPreference(pref: AuthLoginPreference, sharedDevice: boolean) {
  saveLoginPreference(pref, sharedDevice ? 'session' : 'local')
}

export function setDeviceLastLocation(loc: AuthLocationCode) {
  // OK to persist this even on shared devices (non-identity).
  saveLastLocation(loc, 'local')
}

export function setDeviceIsSharedDevice(sharedDevice: boolean) {
  if (sharedDevice) {
    clearDeviceAuthPreference({ keepLastLocation: true })
    saveIsSharedDevice(true, 'session')
    return
  }
  saveIsSharedDevice(false, 'local')
}

export function clearDeviceLoginPreference() {
  clearDeviceAuthPreference({ keepLastLocation: true })
}

