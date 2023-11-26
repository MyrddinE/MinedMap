// bsearch-based array element check
function contains(array, elem) {
	let min = 0, max = array.length;

	while (min < max) {
		const i = min + Math.floor((max-min)/2);
		const cur = array[i];

		if (cur === elem)
			return true;
		else if (cur < elem)
			min = i + 1;
		else
			max = i;
	}

	return false;
}

const MinedMapLayer = L.TileLayer.extend({
	initialize: function (mipmaps, layer) {
		L.TileLayer.prototype.initialize.call(this, '', {
			detectRetina: true,
			tileSize: 512,
			zoomReverse: true,
			minZoom: -(mipmaps.length-1),
			maxZoom: 0,
			attribution: 'Generated by <a href="https://github.com/neocturne/MinedMap">MinedMap</a>',
		});

		this.options.maxNativeZoom = this.options.maxZoom;
		this.options.maxZoom = undefined;

		this.mipmaps = mipmaps;
		this.layer = layer;
	},

	createTile: function (coords, done) {
		const tile = L.TileLayer.prototype.createTile.call(this, coords, done);

		if (coords.z - this.options.zoomOffset >= 0)
			L.DomUtil.addClass(tile, 'overzoomed');

		return tile;
	},

	getTileUrl: function (coords) {
		let z = -coords.z + this.options.zoomOffset;
		if (z < 0)
			z = 0;

		const mipmap = this.mipmaps[z];

		if (coords.x < mipmap.bounds.minX || coords.x > mipmap.bounds.maxX ||
		    coords.y < mipmap.bounds.minZ || coords.y > mipmap.bounds.maxZ ||
		    !contains(mipmap.regions[coords.y] || [], coords.x))
			return L.Util.emptyImageUrl;


		return 'data/'+this.layer+'/'+z+'/r.'+coords.x+'.'+coords.y+'.png';
	},
});


const CoordControl = L.Control.extend({
	initialize: function () {
		this.options.position = 'bottomleft';
	},

	onAdd: function (map) {
		this._container = L.DomUtil.create('div', 'leaflet-control-attribution');

		return this._container;
	},

	update: function (x, z) {
		if (!this._map) { return; }

		this._container.innerHTML = 'X: ' + x + '&nbsp;&nbsp;&nbsp;Z: ' + z;
	}
});


const parseHash = function () {
	const args = {};

	if (window.location.hash) {
		const parts = window.location.hash.substring(1).split('&');

		for (const part of parts) {
			const key_value = part.split('=');
			const key = key_value[0], value = key_value.slice(1).join('=');

			args[key] = value;
		}
	}

	return args;
}

const colors = {
	black: '#000000',
	dark_blue: '#0000AA',
	dark_green: '#00AA00',
	dark_aqua: '#00AAAA',
	dark_red: '#AA0000',
	dark_purple: '#AA00AA',
	gold: '#FFAA00',
	gray: '#AAAAAA',
	dark_gray: '#555555',
	blue: '#5555FF',
	green: '#55FF55',
	aqua: '#55FFFF',
	red: '#FF5555',
	light_purple: '#FF55FF',
	yellow: '#FFFF55',
	white: '#FFFFFF',
};

function formatSignLine(line) {
	const el = document.createElement('span');
	el.style.whiteSpace = 'pre';
	el.style.fontFamily = 'sans';

	for (const span of line) {
		const child = document.createElement('span');
		child.textContent = span.text;

		const color = colors[span.color ?? 'black'] || colors['black'];

		if (span.bold)
			child.style.fontWeight = 'bold';
		if (span.italic)
			child.style.fontStyle = 'italic';

		child.style.textDecoration = '';
		if (span.underlined)
			child.style.textDecoration += ' underline';
		if (span.strikethrough)
			child.style.textDecoration += ' line-through';

		child.style.color = color;
		if (span.obfuscated) {
			child.style.backgroundColor = color;
			child.className = 'obfuscated';
		}

		el.appendChild(child);
	}
	return el;
}

function loadSigns(signLayer) {
	const xhr = new XMLHttpRequest();
	xhr.onload = function () {
		const res = JSON.parse(this.responseText);
		const groups = {};

		// Group signs by x,z coordinates
		for (const sign of res.signs) {
			const key = `${sign.x},${sign.z}`;
			const group = groups[key] ??= [];
			group[sign.y] = sign;
		}

		for (const [key, group] of Object.entries(groups)) {
			const el = document.createElement('span');
			const [x, z] = key.split(',').map((i) => +i);

			group.forEach((sign) => {
				if (sign.front_text) {
					for (const line of sign.front_text) {
						el.appendChild(formatSignLine(line));
						el.appendChild(document.createElement('br'));
					}

					el.appendChild(document.createElement('hr'));
				}

				if (sign.back_text) {
					for (let line of sign.back_text) {
						el.appendChild(formatSignLine(line));
						el.appendChild(document.createElement('br'));
					}

					el.appendChild(document.createElement('hr'));
				}
			});

			const lastChild = el.lastChild;
			if (lastChild)
				lastChild.remove();

			L.marker([-z-0.5, x+0.5]).addTo(signLayer).bindPopup(el);
		}
	}

	xhr.open('GET', 'data/entities.json', true);
	xhr.send();
}

window.createMap = function () {
	const xhr = new XMLHttpRequest();
	xhr.onload = function () {
		const res = JSON.parse(this.responseText),
		    mipmaps = res.mipmaps,
		    spawn = res.spawn;

		let x, z, zoom, light, signs;

		const updateParams = function () {
			const args = parseHash();

			zoom = parseInt(args['zoom']);
			x = parseFloat(args['x']);
			z = parseFloat(args['z']);
			light = parseInt(args['light']);
			signs = parseInt(args['signs'] ?? '1');

			if (isNaN(zoom))
				zoom = 0;
			if (isNaN(x))
				x = spawn.x;
			if (isNaN(z))
				z = spawn.z;
		};

		updateParams();

		const map = L.map('map', {
			center: [-z, x],
			zoom: zoom,
			minZoom: -(mipmaps.length-1),
			maxZoom: 3,
			crs: L.CRS.Simple,
			maxBounds: [
				[-512*(mipmaps[0].bounds.maxZ+1), 512*mipmaps[0].bounds.minX],
				[-512*mipmaps[0].bounds.minZ, 512*(mipmaps[0].bounds.maxX+1)],
			],
		});

		const mapLayer = new MinedMapLayer(mipmaps, 'map');
		const lightLayer = new MinedMapLayer(mipmaps, 'light');
		const signLayer = L.layerGroup();

		loadSigns(signLayer);

		mapLayer.addTo(map);

		if (light)
			map.addLayer(lightLayer);
		if (signs)
			map.addLayer(signLayer);

		const overlayMaps = {
			"Illumination": lightLayer,
			"Signs": signLayer,
		};

		L.control.layers({}, overlayMaps).addTo(map);

		const coordControl = new CoordControl();
		coordControl.addTo(map);

		map.on('mousemove', function(e) {
			coordControl.update(Math.round(e.latlng.lng), Math.round(-e.latlng.lat));
		});

		const makeHash = function () {
			let ret = '#x='+x+'&z='+z;

			if (zoom != 0)
				ret += '&zoom='+zoom;

			if (map.hasLayer(lightLayer))
				ret += '&light=1';
			if (!map.hasLayer(signLayer))
				ret += '&signs=0';

			return ret;
		};

		const updateHash = function () {
			window.location.hash = makeHash();
		};

		const refreshHash = function (ev) {
			if (ev.type === 'layeradd' || ev.type === 'layerremove') {
				if (ev.layer !== lightLayer && ev.layer !== signLayer)
					return;
			}

			zoom = map.getZoom();
			center = map.getCenter();
			x = Math.round(center.lng);
			z = Math.round(-center.lat);

			updateHash();
		}

		updateHash();

		map.on('moveend', refreshHash);
		map.on('zoomend', refreshHash);
		map.on('layeradd', refreshHash);
		map.on('layerremove', refreshHash);

		window.onhashchange = function () {
			if (window.location.hash === makeHash())
				return;

			updateParams();

			map.setView([-z, x], zoom);

			if (light)
				map.addLayer(lightLayer);
			else
				map.removeLayer(lightLayer);
			if (signs)
				map.addLayer(signLayer);
			else
				map.removeLayer(signLayer);

			updateHash();
		};

	};

	xhr.open('GET', 'data/info.json', true);
	xhr.send();
}
