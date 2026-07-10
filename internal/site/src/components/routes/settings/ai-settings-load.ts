export async function loadAISettingsSnapshot<Config, Task>(
	loadConfig: () => Promise<Config>,
	loadTasks: () => Promise<Task[]>
) {
	const [config, tasks] = await Promise.all([loadConfig(), loadTasks()])
	return { config, tasks }
}
