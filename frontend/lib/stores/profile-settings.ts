// Profile settings shared state and actions.
//
// The settings page decomposes into focused subcomponents under
// lib/components/profile/. This module owns the writable form state and the
// load/save lifecycle. The page becomes a thin layout binding stores to
// subcomponents.

import type { FamilyRelationship, UserProfile } from '$lib/types/profile'
import { getProfile, updateProfile, uploadProfilePhoto } from '$lib/services/profile-service'
import { writable } from 'svelte/store'

export const profile = writable<UserProfile | null>(null)
export const loading = writable(true)
export const saving = writable(false)
export const uploading = writable(false)
export const error = writable('')
export const successMessage = writable('')

export const displayName = writable('')
export const bio = writable('')
export const familyRelationship = writable('')
export const generation = writable('')
export const familyBranch = writable('')
export const isProfilePrivate = writable(false)

export const familyRelationships = writable<FamilyRelationship[]>([])

export const contactEmail = writable('')
export const notifyOnMessage = writable(true)
export const notifyOnComment = writable(true)

export const photoFile = writable<File | null>(null)
export const previewUrl = writable('')

function get<T>(store: { subscribe: (run: (v: T) => void) => () => void }): T {
  let value: T
  store.subscribe((v) => {
    value = v
  })()
  return value!
}

export function resetState(): void {
  profile.set(null)
  loading.set(true)
  saving.set(false)
  uploading.set(false)
  error.set('')
  successMessage.set('')
  photoFile.set(null)
}

export async function loadProfileForUser(userId: string): Promise<void> {
  loading.set(true)
  error.set('')

  const result = await getProfile(userId)
  if (result.success && result.data) {
    const p = result.data as UserProfile
    profile.set(p)
    displayName.set(p.displayName || '')
    bio.set(p.bio || '')
    familyRelationship.set(p.familyRelationship || '')
    generation.set(p.generation || '')
    familyBranch.set(p.familyBranch || '')
    isProfilePrivate.set(p.isProfilePrivate || false)
    previewUrl.set(p.profilePhotoUrl || '')
    contactEmail.set(p.contactEmail || '')
    notifyOnMessage.set(p.notifyOnMessage !== false)
    notifyOnComment.set(p.notifyOnComment !== false)
    familyRelationships.set(p.familyRelationships || [])
  }
  else {
    error.set(result.error || 'Failed to load profile')
  }
  loading.set(false)
}

export async function saveProfile(): Promise<boolean> {
  if (!get(displayName).trim()) {
    error.set('Display name is required')
    return false
  }

  saving.set(true)
  error.set('')
  successMessage.set('')

  try {
    let photoUrl: string | undefined
    const file = get(photoFile)

    if (file) {
      uploading.set(true)
      const uploadResult = await uploadProfilePhoto(file)
      if (uploadResult.success && uploadResult.url) {
        photoUrl = uploadResult.url
      }
      else {
        error.set(uploadResult.error || 'Failed to upload photo')
        saving.set(false)
        uploading.set(false)
        return false
      }
      uploading.set(false)
    }

    const validRelationships = get(familyRelationships).filter(
      r => r.type && r.name.trim(),
    )

    const result = await updateProfile({
      displayName: get(displayName).trim(),
      bio: get(bio).trim() || undefined,
      familyRelationship: get(familyRelationship).trim() || undefined,
      generation: get(generation).trim() || undefined,
      familyBranch: get(familyBranch).trim() || undefined,
      isProfilePrivate: get(isProfilePrivate),
      contactEmail: get(contactEmail).trim() || undefined,
      notifyOnMessage: get(notifyOnMessage),
      notifyOnComment: get(notifyOnComment),
      familyRelationships: validRelationships,
      ...(photoUrl && { profilePhotoUrl: photoUrl }),
    })

    if (result.success) {
      successMessage.set('Profile updated successfully!')
      saving.set(false)
      return true
    }
    error.set(result.error || 'Failed to update profile')
  }
  catch (err) {
    error.set(err instanceof Error ? err.message : 'Failed to update profile')
  }

  saving.set(false)
  return false
}
