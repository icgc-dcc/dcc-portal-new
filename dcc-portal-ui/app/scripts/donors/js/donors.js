/*
 * Copyright 2016(c) The Ontario Institute for Cancer Research. All rights reserved.
 *
 * This program and the accompanying materials are made available under the terms of the GNU Public
 * License v3.0. You should have received a copy of the GNU General Public License along with this
 * program. If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
 * WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function() {
  'use strict';

  var module = angular.module('icgc.donors', ['icgc.donors.controllers', 'ui.router']);

  const stateResolver = {
    donor: [
      '$stateParams',
      'Donors',
      function($stateParams, Donors) {
        return Donors.one($stateParams.id)
          .get({ include: 'specimen' })
          .then(function(donor) {
            return donor;
          });
      },
    ],
  };

  module.config(function($stateProvider) {
    $stateProvider.state('donor', {
      url: '/donors/:id',
      templateUrl: 'scripts/donors/views/donor.html',
      controller: 'DonorCtrl as DonorCtrl',
      data: { tab: 'summary' },
      resolve: stateResolver,
    });

    // [ {tab name}, {url} ] - consumed below by forEach
    const tabs = [['clinicalData', 'clinical-data'], ['specimen', 'specimen'], ['mutations', 'mutations'], ['files', 'files']];

    tabs.forEach(tab => {
      $stateProvider.state(`donor.${tab[0]}`, {
        url: `/${tab[1]}`,
        reloadOnSearch: false,
        data: { tab: `${tab[0]}` },
      });
    });
  });
})();

(function() {
  'use strict';

  var module = angular.module('icgc.donors.controllers', ['icgc.donors.models']);

  module.controller('DonorCtrl', function(
    $scope,
    $state,
    $modal,
    Page,
    donor,
    Projects,
    Mutations,
    ExternalRepoService,
    PCAWG,
    RouteInfoService
  ) {
    var _ctrl = this,
      promise;
    var dataRepoRoutInfo = RouteInfoService.get('dataRepositories');
    var dataRepUrl = dataRepoRoutInfo.href;

    Page.setTitle(donor.id);
    Page.setPage('entity');

    setActiveTab($state.current.data.tab);

    _ctrl.hasSupplementalFiles = function(donor) {
      return donor.biomarker || donor.family || donor.exposure || donor.surgery || donor.therapy;
    };

    _ctrl.isPCAWG = function(donor) {
      return _.some(donor.studies, PCAWG.isPCAWGStudy);
    };

    _ctrl.donor = donor;
    _ctrl.isPendingDonor = _.isUndefined(_.get(donor, 'primarySite'));

    var donorFilter = {
      file: {
        donorId: {
          is: [donor.id],
        },
      },
    };

    _ctrl.dataRepoTitle = dataRepoRoutInfo.title;

    _ctrl.urlToExternalRepository = function() {
      return dataRepUrl + '?filters=' + angular.toJson(donorFilter);
    };

    _ctrl.donor.clinicalXML = null;
    promise = ExternalRepoService.getList({
      filters: {
        file: {
          donorId: { is: [_ctrl.donor.id] },
          fileFormat: { is: ['XML'] },
        },
      },
    });
    promise.then(function(results) {
      var fileCopy = _.get(results, 'hits[0].fileCopies[0]', undefined);

      if (_.isPlainObject(fileCopy)) {
        _ctrl.donor.clinicalXML =
          fileCopy.repoBaseUrl.replace(/\/$/, '') + fileCopy.repoDataPath + fileCopy.fileName;
      }
    });

    _ctrl.downloadDonorData = function() {
      $modal.open({
        templateUrl: '/scripts/downloader/views/request.html',
        controller: 'DownloadRequestController',
        resolve: {
          filters: function() {
            return {
              donor: { id: { is: [_ctrl.donor.id] } },
            };
          },
        },
      });
    };

    Projects.getList().then(function(projects) {
      var p = _.find(projects.hits, function(item) {
        return item.id === donor.projectId;
      });

      if (p) {
        _ctrl.donor.ssmTestedDonorCount = p.ssmTestedDonorCount;
      }
    });

    function refresh() {
      var params = {
        filters: { donor: { id: { is: [_ctrl.donor.id] } } },
        size: 0,
        include: ['facets'],
      };
      Mutations.getList(params).then(function(d) {
        _ctrl.mutationFacets = d.facets;
      });
    }

    function setActiveTab(tab) {
      if (_ctrl.activeTab !== tab)
        _ctrl.activeTab = tab;
    }

    $scope.$on('$locationChangeSuccess', function(event, dest) {
      if (dest.indexOf('donors') !== -1) {
        refresh();
      }
    });

    $scope.$watch(
      function() {
        var stateData = angular.isDefined($state.current.data) ? $state.current.data : null;
        if (
          !stateData ||
          !angular.isDefined(stateData.tab)
        ) {
          return null;
        }
        return stateData.tab;
      },
      function(tab) {
        if (tab !== null) {
          setActiveTab(tab);
        }
      }
    );

    refresh();
  });

  module.controller('DonorMutationsCtrl', function(
    $scope,
    $modal,
    Restangular,
    Donors,
    Projects,
    LocationService,
    ProjectCache
  ) {
    var _ctrl = this,
      donor;

    // Opens mutation modal on click
    _ctrl.openMutationModal = function(mutation) {
      $modal.open({
        templateUrl: '/scripts/mutations/views/mutations.evidenceItemsModal.html',
        controller: 'EvidenceItemModalCtrl',
        size: 'mutation',
        resolve: {
          mutation: () => mutation,
          levelFilter: () => null,
        },
      });
    };

    function success(mutations) {
      if (mutations.hasOwnProperty('hits')) {
        var projectCachePromise = ProjectCache.getData();

        _ctrl.mutations = mutations;

        _ctrl.mutations.advQuery = LocationService.mergeIntoFilters({
          donor: { id: { is: [donor.id] } },
        });
        _ctrl.mutations.viewerQuery = LocationService.mergeIntoFilters({
          donor: {
            id: { is: [donor.id] },
            projectId: { is: [donor.projectId] },
          },
        });

        // Need to get SSM Test Donor counts from projects
        Projects.getList().then(function(projects) {
          _ctrl.mutations.hits.forEach(function(mutation) {
            Donors.getList({
              size: 0,
              include: 'facets',
              filters: LocationService.mergeIntoFilters({ mutation: { id: { is: mutation.id } } }),
            }).then(function(data) {
              mutation.advQuery = LocationService.mergeIntoFilters({
                donor: { projectId: { is: [donor.projectId] } },
                mutation: { id: { is: [mutation.id] } },
              });

              mutation.advQueryAll = LocationService.mergeIntoFilters({
                mutation: { id: { is: [mutation.id] } },
              });

              mutation.uiDonors = data.facets.projectId.terms;
              mutation.uiDonors.forEach(function(facet) {
                var p = _.find(projects.hits, function(item) {
                  return item.id === facet.term;
                });

                projectCachePromise.then(function(lookup) {
                  facet.projectName = lookup[facet.term] || facet.term;
                });

                facet.advQuery = LocationService.mergeIntoFilters({
                  mutation: { id: { is: [mutation.id] } },
                  donor: { projectId: { is: [facet.term] } },
                });

                facet.countTotal = p.ssmTestedDonorCount;
                facet.percentage = facet.count / p.ssmTestedDonorCount;
              });
            });
          });
        });
      }
    }

    function refresh() {
      var params = LocationService.getPaginationParams('mutations');

      Donors.one()
        .get({ include: 'specimen' })
        .then(function(d) {
          donor = d;

          var filters = LocationService.filters();
          if (!filters.donor) {
            filters.donor = {};
          }
          filters.donor.projectId = { is: [donor.projectId] };

          Restangular.one('ui')
            .one('search')
            .one('donor-mutations')
            .get({
              from: params.from,
              size: params.size,
              sort: params.sort,
              order: params.order,
              filters: filters,
              donorId: d.id,
              include: 'consequences',
            })
            .then(success);
        });
    }

    $scope.$on('$locationChangeSuccess', function(event, dest) {
      if (dest.indexOf('donors') !== -1) {
        refresh();
      }
    });

    refresh();
  });

  module.controller('DonorSpecimenCtrl', function(Donors, PCAWG, $stateParams, $filter) {
    var _ctrl = this,
      donorId = $stateParams.id || null;

    _ctrl.PCAWG = PCAWG;
    _ctrl.uiSpecimenSamples = [];

    // Defaults for client side pagination
    _ctrl.currentSpecimenPage = 1;
    _ctrl.defaultSpecimenRowLimit = 10;
    _ctrl.rowSizes = [10, 25, 50];

    _ctrl.isPCAWG = function(specimen) {
      if (!specimen) {
        return false;
      }

      return _.some(_.map(specimen.samples, 'study'), PCAWG.isPCAWGStudy);
    };

    _ctrl.setActive = function(id) {
      Donors.one(donorId)
        .get({ include: 'specimen' })
        .then(function(donor) {
          if (donor.hasOwnProperty('specimen')) {
            _ctrl.active = id || donor.specimen[0].id;
            _ctrl.specimen = _.find(donor.specimen, function(s) {
              return s.id === _ctrl.active;
            });
            // Replace any CGHub Repo's with GDC
            _ctrl.specimen.samples = _ctrl.specimen.samples.map(sample => {
              sample.availableRawSequenceData = sample.availableRawSequenceData.map(data => {
                if (data.repository === 'CGHub') {
                  data.repository = 'GDC';
                }
                return data;
              });
              return sample;
            });
          }
        })
        .then(function() {
          _ctrl.uiSpecimenSamples = getUiSpecimenJSON(_ctrl.specimen.samples);
        });
    };

    function getUiSpecimenJSON(samples) {
      return samples.map(function(sample) {
        const availableRawSequenceData = processAvailableRawSequenceData(
          sample.analyzedId,
          sample.availableRawSequenceData
        );
        return _.extend(
          {},
          {
            uiId: sample.id,
            uiAnalyzedId: sample.analyzedId,
            uiStudy: sample.study,
            uiAnalyzedInterval: sample.analyzedInterval,
            uiAnalyzedIntervalFiltered: $filter('numberPT')(sample.analyzedInterval),
            uiAvailableRawSequenceData: availableRawSequenceData,
            uiUniqueRawSequenceData: $filter('unique')(availableRawSequenceData),
          }
        );
      });
    }

    function processAvailableRawSequenceData(analyzedId, availableRawSequenceData) {
      return availableRawSequenceData.map(data => {
        if (data.repository === 'GDC') {
          // Reduce available libraryStrategies into one string ready for querying the GDC legacy portal with
          const libraryStrategies = availableRawSequenceData.reduce((acc, curr, index, arr) => {
            if (index < arr.length - 1) {
              return acc + `"${curr.libraryStrategy}", `;
            } else {
              return acc + `"${curr.libraryStrategy}"`;
            }
          }, '');
          // Build the link
          data.gdcLegacyLink = gdcLegacyLinkCreator(analyzedId, libraryStrategies);
        }
        return data;
      });
    }

    function gdcLegacyLinkCreator(analyzedId, libraryStrategies) {
      // Extract first three "blocks" of analyzedId
      const submitter_id = analyzedId.match(/[^-]*-[^-]*-[^-]*/g)[0];
      if (libraryStrategies.length > 0) {
        return `https://portal.gdc.cancer.gov/legacy-archive/search/f?filters={"op":"and","content":[{"op":"in","content":{"field":"files.data_format","value":["BAM","FASTQ"]}},{"op":"in","content":{"field":"files.data_category","value":["Raw sequencing data"]}},{"op":"in","content":{"field":"cases.submitter_id","value":["${submitter_id}"]}},{"op":"in","content":{"field":"files.experimental_strategy","value":[${libraryStrategies}]}}]}`;
      } else {
        return `https://portal.gdc.cancer.gov/legacy-archive/search/f?filters={"op":"and","content":[{"op":"in","content":{"field":"files.data_format","value":["BAM","FASTQ"]}},{"op":"in","content":{"field":"files.data_category","value":["Raw sequencing data"]}},{"op":"in","content":{"field":"cases.submitter_id","value":["${submitter_id}"]}}]}`;
      }
    }

    _ctrl.setActive();
  });

  module.controller('DonorFilesCtrl', function(
    $scope,
    $rootScope,
    $modal,
    $state,
    $stateParams,
    $location,
    RouteInfoService,
    LocationService,
    ExternalRepoService,
    FilterService
  ) {
    var _ctrl = this,
      commaAndSpace = ', ';

    _ctrl.donorId = $stateParams.id || null;
    _ctrl.summary = {};
    _ctrl.facetCharts = {};
    _ctrl.cloudRepos = ['AWS - Virginia', 'Collaboratory - Toronto'];

    _ctrl.dataRepoFileUrl = RouteInfoService.get('dataRepositoryFile').href;

    _ctrl.barChartConfigOverrides = {
      chart: {
        type: 'column',
        marginTop: 20,
        marginBottom: 20,
        backgroundColor: 'transparent',
        spacingTop: 1,
        spacingRight: 20,
        spacingBottom: 20,
        spacingLeft: 10,
      },
      xAxis: {
        labels: {
          rotation: 0,
          align: 'left',
          x: -5,
          y: 12,
          formatter: function() {
            var isCloudRepo = _.includes(_ctrl.cloudRepos, this.value);
            return isCloudRepo ? '\ue844' : '';
          },
        },
        gridLineColor: 'transparent',
        minorGridLineWidth: 0,
      },
      yAxis: {
        gridLineColor: 'transparent',
        endOnTick: false,
        maxPadding: 0.01,
        labels: {
          formatter: function() {
            return this.value / 1000 + 'k';
          },
        },
        lineWidth: 1,
        title: {
          align: 'high',
          offset: 0,
          margin: -20,
          y: -10,
          rotation: 0,
          text: '# of Files',
        },
      },
      plotOptions: {
        series: {
          minPointLength: 2,
          pointPadding: 0,
          maxPointWidth: 100,
          borderRadiusTopLeft: 2,
          borderRadiusTopRight: 2,
          cursor: 'pointer',
          stickyTracking: false,
          point: {
            events: {
              click: function() {
                var params = {};
                params.file = {};
                params.file.repoName = { is: [this.category] };
                params.file.donorId = { is: [_ctrl.donorId] };

                $state.go('dataRepositories', { filters: angular.toJson(params) });
              },
              mouseOut: $scope.$emit.bind($scope, 'tooltip::hide'),
            },
          },
        },
      },
    };

    _ctrl.pieChartConfigOverrides = {
      plotOptions: {
        pie: {
          events: {
            click: function(e) {
              var params = {};
              params.file = {};
              params.file[e.point.facet] = { is: [e.point.term] };
              params.file.donorId = { is: [_ctrl.donorId] };
              $state.go('dataRepositories', { filters: angular.toJson(params) });
            },
          },
        },
      },
    };

    function tooltipList(objects, property, oneItemHandler) {
      var uniqueItems = _(objects)
        .map(property)
        .uniq();

      if (uniqueItems.size() < 2) {
        return _.isFunction(oneItemHandler) ? oneItemHandler() : '' + oneItemHandler;
      }
      return uniqueItems
        .map(function(s) {
          return '<li>' + s;
        })
        .join('</li>');
    }

    function uniquelyConcat(fileCopies, property) {
      return _(fileCopies)
        .map(property)
        .uniq()
        .join(commaAndSpace);
    }

    _ctrl.fileFormats = function(fileCopies) {
      return uniquelyConcat(fileCopies, 'fileFormat');
    };

    _ctrl.fileNames = function(fileCopies) {
      return tooltipList(fileCopies, 'fileName', function() {
        return _.get(fileCopies, '[0].fileName', '');
      });
    };

    _ctrl.repoNames = function(fileCopies) {
      return uniquelyConcat(fileCopies, 'repoName');
    };

    _ctrl.repoNamesInTooltip = function(fileCopies) {
      return tooltipList(fileCopies, 'repoName', '');
    };

    _ctrl.fileAverageSize = function(fileCopies) {
      var count = _.size(fileCopies);
      return count > 0 ? _.sumBy(fileCopies, 'fileSize') / count : 0;
    };

    _ctrl.export = function() {
      var params = { donor: { id: { is: _ctrl.donorId } } };
      ExternalRepoService.export(FilterService.filters(params));
    };

    _ctrl.removeCityFromRepoName = function(repoName) {
      if (_.includes(repoName, 'CGHub')) {
        return 'CGHub';
      }

      if (_.includes(repoName, 'TCGA DCC')) {
        return 'TCGA DCC';
      }

      return repoName;
    };

    _ctrl.fixRepoNameInTableData = function(data) {
      _.forEach(data, function(row) {
        _.forEach(row.fileCopies, function(fileCopy) {
          fileCopy.repoName = _ctrl.removeCityFromRepoName(fileCopy.repoName);
        });
      });
    };

    _ctrl.processRepoData = function(data) {
      var filteredRepoNames = _.get(LocationService.filters(), 'file.repoName.is', []);
      var selectedColor = [253, 179, 97];
      var unselectedColor = [22, 147, 192];
      var minAlpha = 0.3;

      var transformedItems = data.s.map(function(item, i, array) {
        var isSelected = _.includes(filteredRepoNames, data.x[i]);
        var baseColor = isSelected ? selectedColor : unselectedColor;
        var alpha = array.length ? 1 - (1 - minAlpha) / array.length * i : 0;
        var rgba = 'rgba(' + baseColor.concat(alpha).join(',') + ')';
        return _.extend({}, item, {
          color: rgba,
          fillOpacity: 0.5,
        });
      });

      return _.extend({}, data, {
        s: transformedItems,
      });
    };

    _ctrl.getFiles = function() {
      var promise,
        params = {},
        filesParam = LocationService.getJqlParam('files');

      // Default
      params.from = 1;
      params.size = 10;

      if (filesParam.from || filesParam.size) {
        params.from = filesParam.from;
        params.size = filesParam.size;
      }

      if (filesParam.sort) {
        params.sort = filesParam.sort;
        params.order = filesParam.order;
      }

      params.filters = { donor: { id: { is: _ctrl.donorId } } };
      params.include = 'facets';

      // Get files
      promise = ExternalRepoService.getList(params);
      promise.then(function(data) {
        // Remove city names from repository names for CGHub and TCGA DCC.
        _ctrl.fixRepoNameInTableData(data.hits);
        _ctrl.files = data;

        if (angular.isDefined(data.termFacets.repoName.terms)) {
          _ctrl.facetCharts = ExternalRepoService.createFacetCharts(data.termFacets);
          _ctrl.facetCharts.repositories = _ctrl.processRepoData(_ctrl.facetCharts.repositories);
        }
      });
    };

    _ctrl.getFiles();

    // Pagination watcher, gets destroyed with scope.
    $scope.$watch(
      function() {
        return JSON.stringify(LocationService.search('files'));
      },
      function(newVal, oldVal) {
        if (newVal !== oldVal) {
          _ctrl.getFiles();
        }
      }
    );
  });
})();

(function() {
  'use strict';

  var module = angular.module('icgc.donors.models', ['restangular', 'icgc.common.location']);

  module.service('Donors', function(
    Restangular,
    LocationService,
    FilterService,
    Donor,
    ApiService
  ) {
    this.handler = Restangular.one('donors');

    this.getList = function(params) {
      var defaults = {
        size: 10,
        from: 1,
        filters: LocationService.filters(),
      };

      var liveFilters = angular.extend(defaults, _.cloneDeep(params));

      return this.handler.get(liveFilters).then(function(data) {
        if (data.hasOwnProperty('facets')) {
          for (var facet in data.facets) {
            if (data.facets.hasOwnProperty(facet) && data.facets[facet].missing) {
              var f = data.facets[facet];
              if (f.hasOwnProperty('terms')) {
                f.terms.push({ term: '_missing', count: f.missing });
              } else {
                f.terms = [{ term: '_missing', count: f.missing }];
              }
            }
          }
          if (
            data.facets.hasOwnProperty('projectId') &&
            data.facets.projectId.hasOwnProperty('terms')
          ) {
            data.facets.projectId.terms = data.facets.projectId.terms.sort(function(a, b) {
              if (a.term < b.term) {
                return -1;
              }
              if (a.term > b.term) {
                return 1;
              }
              return 0;
            });
          }
        }

        return data;
      });
    };

    this.getAll = function(params) {
      return ApiService.getAll(Restangular.all('donors'), params);
    };

    this.one = function(id) {
      return id ? Donor.init(id) : Donor;
    };
  });

  module.service('Donor', function(Restangular) {
    var _this = this;
    this.handler = {};

    this.init = function(ids) {
      ids = _.isArray(ids) ? ids.join(',') : ids;
      this.id = ids;
      this.handler = Restangular.one('donors/' + ids);
      return _this;
    };

    this.get = function(params) {
      var defaults = {};

      return this.handler.get(angular.extend(defaults, params));
    };

    this.getMutations = function(params) {
      var defaults = {
        size: 10,
        from: 1,
      };

      return this.handler.one('mutations', '').get(angular.extend(defaults, params));
    };
  });
})();
