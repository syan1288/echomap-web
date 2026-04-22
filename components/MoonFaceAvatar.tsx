import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Facehash } from 'facehash';
import { facehashPropsForMoonMode, normalizeAvatarVariant } from '../utils/moonFacehash';

type MoonFaceAvatarProps = {
  moon: string;
  avatarVariant?: number;
  size?: number;
  className?: string;
  interactive?: boolean;
};

type BoundaryState = { err: boolean; nonce: number };

class FacehashErrorBoundary extends Component<
  { children: (nonce: number) => ReactNode; size: number },
  BoundaryState
> {
  state: BoundaryState = { err: false, nonce: 0 };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { err: true };
  }

  componentDidCatch(_e: Error, _i: ErrorInfo) {}

  render() {
    const { size } = this.props;
    if (this.state.err) {
      return (
        <div
          className="flex flex-col items-center justify-center border border-black bg-white"
          style={{ width: size, height: size, minWidth: size, minHeight: size }}
        >
          <span className="text-[9px] text-neutral-400">—</span>
          <button
            type="button"
            className="mt-0.5 text-[9px] text-[#332115] underline"
            onClick={() => this.setState({ err: false, nonce: this.state.nonce + 1 })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children(this.state.nonce);
  }
}

/**
 * Face Hash（facehash npm / https://www.facehash.dev/）：Moon + avatarVariant，白底三风格见 moonFacehash。
 */
export const MoonFaceAvatar: React.FC<MoonFaceAvatarProps> = ({
  moon,
  avatarVariant = 0,
  size = 40,
  className = '',
  interactive = false,
}) => {
  const mode = normalizeAvatarVariant(avatarVariant);
  const props = facehashPropsForMoonMode(moon, mode);

  return (
    <FacehashErrorBoundary size={size}>
      {(nonce) => (
        <Facehash
          key={`${props.name}-${nonce}`}
          name={props.name}
          size={size}
          variant={props.variant}
          intensity3d={props.intensity3d}
          interactive={interactive}
          showInitial={props.showInitial}
          colors={[props.colors[0], props.colors[1]]}
          className={className}
        />
      )}
    </FacehashErrorBoundary>
  );
};
