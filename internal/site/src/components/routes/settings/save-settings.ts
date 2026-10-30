import { t } from "@lingui/core/macro"
import { toast } from "@/components/ui/use-toast"
import { getCurrentUserSettingsFilter, pb } from "@/lib/api"
import { $userSettings } from "@/lib/stores"
import type { UserSettings } from "@/types"

type SaveUserSettingsOptions = {
	successToast?: boolean
}

/**
 * Persists the current user's display preferences.
 *
 * Returns false instead of throwing so form pages can keep their draft and
 * show an inline error. Error toasts stay centralized here; success feedback is
 * left to the caller when a save bar already communicates it.
 */
export async function saveUserSettings(
	newSettings: Partial<UserSettings>,
	options: SaveUserSettingsOptions = {}
): Promise<boolean> {
	const { successToast = true } = options
	try {
		const userFilter = getCurrentUserSettingsFilter()
		if (!userFilter) {
			throw new Error("missing current user")
		}
		let req: { id: string; settings: UserSettings }
		try {
			req = await pb.collection("user_settings").getFirstListItem(userFilter, {
				fields: "id,settings",
			})
		} catch {
			// First save: the current user has no user_settings record yet.
			const userId = pb.authStore.record?.id
			if (!userId) {
				throw new Error("missing current user")
			}
			req = await pb.collection("user_settings").create({
				user: userId,
				settings: {},
			})
		}
		const updatedSettings = await pb.collection("user_settings").update(req.id, {
			settings: {
				...req.settings,
				...newSettings,
			},
		})
		$userSettings.set(updatedSettings.settings)
		if (successToast) {
			toast({
				title: t`Settings saved`,
				description: t`Your user settings have been updated.`,
			})
		}
		return true
	} catch {
		toast({
			title: t`Failed to save settings`,
			description: t`Check logs for more details.`,
			variant: "destructive",
		})
		return false
	}
}

/** Legacy entry point used by pages that still rely on the shared success toast. */
export function saveSettings(newSettings: Partial<UserSettings>) {
	return saveUserSettings(newSettings, { successToast: true })
}
