import * as core from '@actions/core'
import * as io   from '@actions/io'
import * as tc   from '@actions/tool-cache'
import * as http from '@actions/http-client'
import * as exec from '@actions/exec'


type github_asset = {
	name: string,
	browser_download_url: string,
}

type github_release = {
	assets: github_asset[]
}

const API_URL = 'https://api.github.com/repos/YosysHQ/oss-cad-suite-build'

async function getDownloadURL(platform = 'linux', arch = 'x64', tag?: string, token?: string): Promise<string> {
	const ARCHIVE_PREFIX = `oss-cad-suite-${platform}-${arch}`
	const API_ENDPOINT = (() => {
		if (tag) {
			return `releases/tags/${tag}`
		}
		return 'releases/latest'
	})()
	const ENDPOINT_URL = `${API_URL}/${API_ENDPOINT}`

	core.debug(`Using API_ENDPOINT of '${API_ENDPOINT}'`)
	core.debug(`Archive prefix is '${ARCHIVE_PREFIX}'`)

	const _http = new http.HttpClient(
		`setup-oss-cad-suite-v${process.env.npm_package_version}`
	)

	core.info(`Getting download URL for ${ARCHIVE_PREFIX}`)
	core.debug(`Endpoint URL is '${ENDPOINT_URL}'`)
	const resp = await _http.getJson<github_release>(
		ENDPOINT_URL, (() => {
			if (token) {
				return {'authorization': `Bearer: ${token}`}
			}
			return undefined
		})()
	)
	const assets = resp.result?.assets

	if (!assets) {
		core.debug('assets is empty')
		throw Error('Unable to get download URL for oss-cad-suite package')
	}

	const url = assets.filter(
		pkg => pkg.name.startsWith(ARCHIVE_PREFIX)
	).map(
		pkg => pkg.browser_download_url
	).shift()

	if (!url) {
		core.debug('Could not find download URL for prefixed package')
		throw Error('Unable to get download URL for oss-cad-suite package')
	}
	return url
}

function _validate(os: NodeJS.Platform , arch: NodeJS.Architecture) {
	if (os === 'linux') {
		const is_arm = ((arch === 'arm64') || (arch === 'arm'))
		if ((!is_arm) && (arch !== 'x64')) {
			throw Error(`Unsupported architecture '${arch}' for linux, must be either arm, arm64, or x64`)
		}
	} else if (os === 'darwin') {
		if ((arch !== 'arm64') && (arch !== 'x64')) {
			throw Error(`Unsupported architecture '${arch}' for darwin, must be either arm64 or x64`)
		}
	} else if (os === 'win32') {
		if (arch !== 'x64') {
			throw Error(`Unsupported architecture '${arch}' for windows, must be x64`)
		}
	} else {
		throw Error(`Unsupported Operating System '${os}', must be either linux or darwin`)
	}
}

function isPosix(os: NodeJS.Platform) {
	return ((os === 'linux') || (os === 'darwin'))
}

async function extractPackage(pkg_file: string, pkg_dir: string, os: NodeJS.Platform) {
	core.info(`Extracting ${pkg_file} to ${pkg_dir}`)
	let suite_path = undefined
	if (isPosix(os)) {
		core.debug('System is a posix-like, using extract tar')
		suite_path = await tc.extractTar(
			pkg_file, pkg_dir,
			['xz', '--strip-components=1']
		)
	} else {
		core.debug('Assuming system is windows, trying to run installer')
		suite_path = pkg_dir
		await exec.exec(
			pkg_file, [
				// Because we can't strip out the root we have to just extract over the dir
				`-o${process.env.RUNNER_TEMP}`, '-y'
			]
		)
	}
	return suite_path
}

function setupEnvironment(suite_path: string) {
	core.debug(`Suite path is '${suite_path}'`)

	// Add the bin dir to the path
	core.addPath(`${suite_path}/bin`)

	// If we are overloading the system python, do so
	if (core.getBooleanInput('python-override')) {
		core.info('Overloading system python with oss-cad-suite provided python')
		core.addPath(`${suite_path}/py3bin`)
	}

}

async function acquirePackage(
	os: NodeJS.Platform , arch: NodeJS.Architecture, pkg_name: string,
	tag?: string, token?: string
) {
	// Get the download URL for the package and then download it
	const download_url = await getDownloadURL(
		os === 'win32' ? 'windows' : os, arch,
		tag === '' ? undefined : tag,
		token === '' ? undefined : token
	)

	// Download the package to the temp directory
	core.info(`Downloading package from ${download_url}`)
	return await tc.downloadTool(
		download_url,
		core.toPlatformPath(`${process.env.RUNNER_TEMP}/${pkg_name}`)
	)
}

async function main(): Promise<void> {
	core.info('Setting up oss-cad-suite')
	try {
		const pkg_dir = core.toPlatformPath(`${process.env.RUNNER_TEMP}/oss-cad-suite`)
		const os = process.platform
		const arch = process.arch
		const tag = core.getInput('version')
		const token = core.getInput('github-token')
		const cache_pkg = core.getBooleanInput('cache')
		const pkg_name = (() => {
			if (isPosix(os)) {
				return 'oss-cad-suite.tgz'
			}
			return 'oss-cad-suite.exe'
		})()

		core.debug(`Package directory is '${pkg_dir}'`)
		core.debug(`Package name is '${pkg_name}'`)

		// Ensure we're running on a supported configuration
		_validate(os, arch)

		// Make the target dir for extraction
		await io.mkdirP(pkg_dir)

		if (cache_pkg) {
			if (tag === '') {
				throw Error('Cache option is set but no version specified')
			}

			const cache_path = tc.find(
				'oss-cad-suite', tag, arch
			)

			if (cache_path !== '') {
				core.info(`Found ${tag} in tool cache, using that.`)
				// We found the file in the cache
				// Extract the package
				const suite_path = await extractPackage(cache_path, pkg_dir, os)
				// Set things up
				setupEnvironment(suite_path)
			} else {
				core.info(`Did not find ${tag} in tool cache, downloading`)
				// Get the package
				const file = await acquirePackage(os, arch, pkg_name, tag, token)
				core.info(`Adding ${tag} to cache`)
				const pkg_file = await tc.cacheFile(
					file, pkg_name, 'oss-cad-suite', tag, arch
				)
				// Extract the package
				const suite_path = await extractPackage(pkg_file, pkg_dir, os)
				// Set things up
				setupEnvironment(suite_path)
			}

		} else {
			// Get the package
			const pkg_file = await acquirePackage(os, arch, pkg_name, tag, token)
			// Extract the package
			const suite_path = await extractPackage(pkg_file, pkg_dir, os)
			// Set things up
			setupEnvironment(suite_path)
		}

		core.info('Done')
	} catch (err) {
		if (err instanceof Error) {
			core.setFailed(err.message)
		}
	}
}

main()
