import React from 'react';
import { ElevationHeight } from '@teambit/base-ui.css-components.elevation';
import { Roundness } from '@teambit/base-ui.css-components.roundness';
export declare type CardProps = {
    /**
     * Controls the shadow cast by the card, to generate a "stacking" effects.
     * For example, a modal floating over elements may have a 'high' elevation
     */
    elevation?: ElevationHeight;
    /** Controls the border radius of the card */
    roundness?: Roundness;
} & React.HTMLAttributes<HTMLDivElement>;
/**
 * A wrapper resembling a physical card, grouping elements and improve readability.
 * @example
 * <Card elevation="medium">
 * 	Lorem ipsum dolor sit amet, consectetur adipiscing elit.
 * </Card>
 */
export declare function Card({ className, elevation, roundness, ...rest }: CardProps): JSX.Element;
export declare namespace Card {
    var defaultProps: {
        elevation: string;
        roundness: string;
    };
}
