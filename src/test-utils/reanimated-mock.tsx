// Minimal Reanimated stand-in for component tests: animations resolve instantly to their target.
import { type ComponentType, forwardRef } from 'react';
import { Text, View } from 'react-native';

type AnyProps = Record<string, unknown>;

function createAnimatedComponent<P extends object>(Component: ComponentType<P>) {
  return forwardRef<unknown, P & { animatedProps?: AnyProps }>(function Animated(props, ref) {
    const { animatedProps, ...rest } = props as P & { animatedProps?: AnyProps };
    const C = Component as unknown as ComponentType<AnyProps>;
    return <C ref={ref} {...(rest as AnyProps)} {...(animatedProps ?? {})} />;
  });
}

const layout = () => {
  const builder: Record<string, () => unknown> = {};
  for (const key of ['duration', 'delay', 'springify', 'damping', 'easing']) builder[key] = () => builder;
  return builder;
};

const AnimatedDefault = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: AnimatedDefault,
  ...AnimatedDefault,
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useAnimatedProps: (fn: () => unknown) => fn(),
  withTiming: (v: unknown) => v,
  withSpring: (v: unknown) => v,
  withDelay: (_d: number, v: unknown) => v,
  withRepeat: (v: unknown) => v,
  Easing: new Proxy({}, { get: () => (x: unknown) => x }),
  FadeIn: layout(),
  FadeInUp: layout(),
  FadeInDown: layout(),
  FadeInRight: layout(),
  FadeOutUp: layout(),
  ZoomIn: layout(),
};
