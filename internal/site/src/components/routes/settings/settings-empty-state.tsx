import { EmptyState, TableEmptyRow } from "@/components/ui/empty-state"

export function SettingsEmptyState({
	loading,
	loadingText,
	emptyText,
	className,
}: {
	loading: boolean
	loadingText: string
	emptyText: string
	className?: string
}) {
	return <EmptyState loading={loading} loadingText={loadingText} emptyText={emptyText} className={className} />
}

export function SettingsTableEmptyRow({
	colSpan,
	loading,
	loadingText,
	emptyText,
}: {
	colSpan: number
	loading: boolean
	loadingText: string
	emptyText: string
}) {
	return <TableEmptyRow colSpan={colSpan} loading={loading} loadingText={loadingText} emptyText={emptyText} />
}
