import { Trans } from "@lingui/react/macro"
import { CopyIcon } from "lucide-react"
import { copyToClipboard } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export function InputCopy({ value, id, name }: { value: string; id: string; name: string }) {
	return (
		<div className="relative">
			<Input readOnly id={id} name={name} value={value} required className="pe-12 font-mono text-xs"></Input>
			<div
				className={
					"pointer-events-none absolute end-10 top-2 h-6 w-16 bg-linear-to-r from-transparent to-card to-65% rtl:bg-linear-to-l"
				}
			></div>
			<Tooltip disableHoverableContent={true}>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute end-1 top-1/2 size-10 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-surface-soft hover:text-foreground"
						onClick={() => copyToClipboard(value)}
					>
						<CopyIcon className="size-4" />
						<span className="sr-only">
							<Trans>Click to copy</Trans>
						</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>
						<Trans>Click to copy</Trans>
					</p>
				</TooltipContent>
			</Tooltip>
		</div>
	)
}
