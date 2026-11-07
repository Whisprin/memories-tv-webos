import React, {useMemo} from 'react';
import Button from '@enact/sandstone/Button';
import {MAP_STYLES, MAP_STYLE_LABELS, useMapStyle} from '../../utils/mapViewStore';
import css from './MapStyleSetting.module.less';

// Settings: how the Map tab draws the map. Applies right away, also to a map open behind Settings.
export const MapStyleSetting: React.FC = () => {
	const [style, setStyle] = useMapStyle();
	const handlers = useMemo(() => Object.fromEntries(MAP_STYLES.map((s) => [s, () => setStyle(s)])), [setStyle]);

	return (
		<section className={css.section}>
			<h4 className={css.heading}>Map style</h4>
			<div className={css.options}>
				{MAP_STYLES.map((s) => (
					<Button
						key={s}
						size="small"
						icon={s === style ? 'check' : undefined}
						selected={s === style}
						aria-pressed={s === style}
						onClick={handlers[s]}
					>
						{MAP_STYLE_LABELS[s]}
					</Button>
				))}
			</div>
		</section>
	);
};

MapStyleSetting.displayName = 'MapStyleSetting';
