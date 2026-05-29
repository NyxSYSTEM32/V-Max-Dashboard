import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
	children: ReactNode;
	label: string;
};

type State = {
	error: Error | null;
};

export class PanelErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(`[V-Max] ${this.props.label} crashed`, error, info);
	}

	render() {
		if (!this.state.error) return this.props.children;

		return (
			<div className="flex h-full min-h-24 flex-col justify-center rounded-xl border border-f1-red/50 bg-f1-red/10 p-4">
				<div className="text-xs font-bold tracking-widest text-f1-red">{this.props.label.toUpperCase()} OFFLINE</div>
				<div className="mt-2 text-[10px] uppercase text-muted">{this.state.error.message || "Panel render failed"}</div>
			</div>
		);
	}
}
