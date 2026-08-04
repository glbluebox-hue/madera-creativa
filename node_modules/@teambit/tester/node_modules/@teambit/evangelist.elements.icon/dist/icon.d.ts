/// <reference types="react" />
import { BaseIconProps } from '@teambit/base-ui.elements.icon';
export declare type IconProps = BaseIconProps;
/**
 * Placeholder for an icon, from Bit.dev's icon font.
 *
 * @name Icon
 * @example
 * // Embed icon at the document root:
 * <EvaIconFont query="sdfj4k2d"/>
 *
 * // Then use icon anywhere in the document:
 * <Icon of="spinner"/>
 */
export declare function Icon({ className, of: iconName, ...rest }: IconProps): JSX.Element;
