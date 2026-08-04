/// <reference types="react" />
import { ButtonProps } from '@teambit/base-ui.input.button';
export declare type IconButtonProps = {
    /**
     * icon name
     */
    icon?: string;
    /**
     * icon override class
     */
    iconClass?: string;
    /**
     * indicate button is on
     */
    active?: boolean;
    /**
     * style variance
     */
    priority?: 'ghost' | 'cta';
    /**
     * button sizes
     */
    size?: 'm' | 'l' | null;
} & ButtonProps;
/**
 *
 * Generic button that supports text, icon and integration of both
 */
export declare function IconButton({ icon, className, children, iconClass, active, priority, size, ...rest }: IconButtonProps): JSX.Element;
