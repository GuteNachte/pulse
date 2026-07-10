export function SuggestionValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-card px-2.5 py-2">
			<div className="text-muted-foreground">{label}</div>
			<div className="mt-1 break-words font-mono text-foreground">{value}</div>
		</div>
	)
}
