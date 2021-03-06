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

  var module = angular.module('icgc.mutations', [
    'icgc.mutations.controllers',
    'icgc.mutations.services',
    'ui.router',
  ]);

  const stateResolver = {
    mutation: [
      '$stateParams',
      'Mutations',
      function($stateParams, Mutations) {
        return Mutations.one($stateParams.id)
          .get({ include: ['occurrences', 'transcripts', 'consequences'] })
          .then(function(mutation) {
            return mutation;
          });
      },
    ],
  };

  module.config(function($stateProvider) {
    $stateProvider.state('mutation', {
      url: '/mutations/:id',
      templateUrl: 'scripts/mutations/views/mutation.html',
      controller: 'MutationCtrl as MutationCtrl',
      data: { tab: 'summary' },
      resolve: stateResolver,
    });

    // [ {tab name}, {url} ] - consumed below by forEach
    const tabs = [
      ['clinicalEvidence', 'clinical-evidence'],
      ['protein', 'protein'],
    ];

    tabs.forEach(tab => {
      $stateProvider.state(`mutation.${tab[0]}`, {
        url: `/${tab[1]}`,
        reloadOnSearch: false,
        data: { tab: `${tab[0]}` },
      });
    });
  });
})();

(function() {
  'use strict';

  var module = angular.module('icgc.mutations.controllers', ['icgc.mutations.models']);

  module.controller('MutationCtrl', function(
    $state,
    $scope,
    HighchartsService,
    Page,
    Genes,
    mutation,
    $filter,
    PCAWG
  ) {
    var _ctrl = this,
      projects;
    Page.setTitle(mutation.id);
    Page.setPage('entity');

    setActiveTab($state.current.data.tab);

    _ctrl.gvOptions = { location: false, panels: false, zoom: 100 };

    _ctrl.mutation = mutation;
    _ctrl.mutation.uiProteinTranscript = [];
    _ctrl.isPVLoading = true;
    _ctrl.isGVLoading = true;

    // Defaults for client side pagination
    _ctrl.currentProjectsPage = 1;
    _ctrl.defaultProjectsRowLimit = 10;
    _ctrl.currentConsequencesPage = 1;
    _ctrl.defaultConsequencesRowLimit = 10;
    _ctrl.currentClinicalEvidencePage = 1;
    _ctrl.defaultClinicalEvidenceRowLimit = 10;
    _ctrl.rowSizes = [10, 25, 50];

    projects = {};
    _ctrl.projects = [];
    _ctrl.uiConsequences = getUiConsequencesJSON(_ctrl.mutation.consequences);
    _ctrl.uiEvidenceItems = getUiEvidenceItems(_ctrl.mutation.clinical_evidence.civic || []);

    // Sort functions for evidence items
    _ctrl.evItemsSorter = function(nextCol, sort) {
      var defaultSort = {
        col: nextCol,
        dir: 'desc',
      };

      // If sort is undefined return default sort
      if (typeof sort === 'undefined') {
        return defaultSort;
      }

      // Changing sort direction on same column ...
      if (nextCol === sort.col) {
        return {
          col: nextCol,
          dir: sort.dir === 'asc' ? 'desc' : 'asc',
        };
      }

      // New column sort is the default
      return {
        col: nextCol,
        dir: 'desc',
      };
    };

    _ctrl.evItemSortIcon = function(thisCol, sort) {
      var isOrderingCol = thisCol === sort.col;

      if (isOrderingCol && sort.dir === 'desc') {
        return 'icon-sort-down';
      } else if (isOrderingCol && sort.dir === 'asc') {
        return 'icon-sort-up';
      }

      // Defaul is sideways icon idicating no sort on the column
      return 'icon-sort';
    };

    // Append manual text to description
    if (_ctrl.mutation.description) {
      _ctrl.mutation.description += ' [provided by CIVIC, Jan 2018]';
    }

    // Append manual text to clinical significance
    if (_ctrl.mutation.clinical_significance.clinvar) {
      const parseDate = date => {
        if (date) {
          const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];
          const dateObj = new Date(_ctrl.mutation.clinical_significance.clinvar.lastEvaluated);
          return months[dateObj.getMonth()] + ' ' + dateObj.getFullYear();
        }

        return 'Jan 2018';
      };
      const date = parseDate(_ctrl.mutation.clinical_significance.clinvar.lastEvaluated);
      _ctrl.mutation.clinical_significance.clinvar.clinicalSignificance +=
        ' [provided by Clinvar, ' + date + ']';
    }

    if (_ctrl.mutation.hasOwnProperty('occurrences')) {
      _ctrl.mutation.occurrences.forEach(function(occurrence) {
        if (projects.hasOwnProperty(occurrence.projectId)) {
          projects[occurrence.projectId].affectedDonorCount++;
        } else {
          projects[occurrence.projectId] = occurrence.project;
          projects[occurrence.projectId].affectedDonorCount = 1;
        }
      });
    }

    for (var p in projects) {
      if (projects.hasOwnProperty(p)) {
        var project = projects[p];
        project.percentAffected = project.affectedDonorCount / project.ssmTestedDonorCount;
        _ctrl.projects.push(project);
      }
    }

    _ctrl.uiProjects = getUiProjects(_ctrl.projects);

    function getUiProjects(projects) {
      return projects.map(function(project) {
        return _.extend(
          {},
          {
            uiId: project.id,
            uiName: project.name,
            uiPrimarySite: project.primarySite,
            uiTumourType: project.tumourType,
            uiTumourSubtype: project.tumourSubtype,
            uiPercentAffected: $filter('number')(project.percentAffected * 100, 2),
            uiAffectedDonorCount: $filter('number')(project.affectedDonorCount),
            uiSSMTestedDonorCount: $filter('number')(project.ssmTestedDonorCount),
          }
        );
      });
    }

    if (mutation.functionalImpact.indexOf('High') !== -1) {
      mutation.displayedFunctionalImpact = 'High';
    } else if (mutation.functionalImpact.indexOf('Low') !== -1) {
      mutation.displayedFunctionalImpact = 'Low';
    } else {
      mutation.displayedFunctionalImpact = 'Unknown';
    }

    if (_ctrl.mutation.hasOwnProperty('consequences') && _ctrl.mutation.consequences.length) {
      var affectedGeneIds = _.filter(_.map(_ctrl.mutation.consequences, 'geneAffectedId'), function(
        d
      ) {
        return !_.isUndefined(d);
      });

      if (affectedGeneIds.length > 0) {
        Genes.getList({
          filters: { gene: { id: { is: affectedGeneIds } } },
          field: [],
          include: 'transcripts',
          size: 100,
        }).then(function(genes) {
          var geneTranscripts = _.map(genes.hits, 'transcripts');
          var mergedTranscripts = [];
          geneTranscripts.forEach(function(t) {
            mergedTranscripts = mergedTranscripts.concat(t);
          });

          // Using mutation transcripts to check conditions
          _ctrl.mutation.transcripts.forEach(function(transcript) {
            var hasProteinCoding, aaMutation, hasAaMutation;

            // 1) Check if transcript has protein_coding
            hasProteinCoding = transcript.type === 'protein_coding';

            // 2) Has aaMutation
            aaMutation = transcript.consequence.aaMutation;
            hasAaMutation =
              aaMutation && aaMutation !== '' && aaMutation !== '-999' && aaMutation !== '--';

            if (hasProteinCoding && hasAaMutation) {
              // Need to use gene transcripts here to get domains
              _ctrl.mutation.uiProteinTranscript.push(
                _.find(mergedTranscripts, function(t) {
                  return t.id === transcript.id;
                })
              );
            }
          });
          _ctrl.mutation.uiProteinTranscript = _.sortBy(
            _ctrl.mutation.uiProteinTranscript,
            function(t) {
              return t.name;
            }
          );
        });
      }
    }

    _ctrl.bar = HighchartsService.bar({
      hits: _.sortBy(_ctrl.projects, function(p) {
        return -p.percentAffected;
      }),
      xAxis: 'id',
      yValue: 'percentAffected',
      options: {
        linkBase: '/projects/',
      },
    });

    function getUiConsequencesJSON(consequences) {
      return consequences.map(function(consequence) {
        return _.extend(
          {},
          {
            uiGeneAffectedId: consequence.geneAffectedId,
            uiAffectedSymbol: consequence.geneAffectedSymbol,
            uiFunctionalImpact: consequence.functionalImpact,
            uiAAMutation: consequence.aaMutation,
            uiType: consequence.type,
            uiTypeFiltered: $filter('trans')(consequence.type),
            uiCDSMutation: consequence.cdsMutation,
            uiGeneStrand: consequence.geneStrand,
            uiTranscriptsAffected: consequence.transcriptsAffected,
          }
        );
      });
    }

    function getUiEvidenceItems(evidenceItems) {
      return evidenceItems.map(function(evidenceItems) {
        return _.extend(
          {},
          {
            uiDisease: evidenceItems.disease,
            uiDrugs:
              evidenceItems.drugs.length > 0 ? evidenceItems.drugs.split(/,\s*(?![^()]*\))/) : [],
            uiEvidenceStatement: evidenceItems.evidenceStatement,
            uiEvidenceLevel: evidenceItems.evidenceLevel,
            uiEvidenceType: evidenceItems.evidenceType,
            uiClinicalImpact: evidenceItems.clinicalImpact,
            uiEvidenceDirection: evidenceItems.evidenceDirection,
            uiPubmedID: evidenceItems.pubmedID,
            doid: evidenceItems.doid,
          }
        );
      });
    }

    function setActiveTab(tab) {
      if (_ctrl.activeTab !== tab)
        _ctrl.activeTab = tab;
    }

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

    _ctrl.isPCAWG = function(mutation) {
      return _.some(mutation.study, PCAWG.isPCAWGStudy);
    };
  });

  module.controller('EvidenceItemModalCtrl', function(
    $scope,
    $modalInstance,
    mutation,
    levelFilter
  ) {
    $scope.params = {};
    $scope.params.mutationId = mutation.id;

    // Filter to only relevant level if level provided, otherwise
    // show all evidence items sorted by evidence level
    $scope.params.evidenceItems = levelFilter
      ? mutation.clinical_evidence.civic.filter(item => item.evidenceLevel === levelFilter)
      : mutation.clinical_evidence.civic.sort((a, b) => {
          const levelA = a.evidenceLevel[0];
          const levelB = b.evidenceLevel[0];
          if (levelA < levelB) {
            return -1;
          }
          if (levelA > levelB) {
            return 1;
          }

          // names must be equal
          return 0;
        });

    // Fix drugs to be a list
    $scope.params.evidenceItems = $scope.params.evidenceItems.map(item => {
      item.drugs =
        item.drugs.length > 0 && typeof item.drugs === 'string'
          ? item.drugs.split(/,\s*(?![^()]*\))/)
          : [];
      return item;
    });

    $scope.params.evidenceItemsCount = $scope.params.evidenceItems.length;
    $scope.params.level = levelFilter ? levelFilter[0] : '';

    $scope.cancel = function() {
      $modalInstance.dismiss('cancel');
    };
  });
})();

(function() {
  'use strict';

  var module = angular.module('icgc.mutations.services', []);

  module.constant('ImpactOrder', ['High', 'Medium', 'Low', 'Unknown', '_missing']);
})();

(function() {
  'use strict';

  var module = angular.module('icgc.mutations.models', []);

  module.service('Mutations', function(
    Restangular,
    FilterService,
    Mutation,
    Consequence,
    ImpactOrder
  ) {
    this.handler = Restangular.all('mutations');

    this.getList = function(params) {
      var defaults = {
        size: 10,
        from: 1,
        filters: FilterService.filters(),
      };

      return this.handler.get('', angular.extend(defaults, params)).then(function(data) {
        if (data.hasOwnProperty('facets')) {
          var precedence = Consequence.precedence();

          _.map(data.facets, facet => {
            if (facet.missing) {
              if (facet.terms) {
                facet.terms.push({ term: '_missing', count: facet.missing });
              } else {
                facet.terms = [{ term: '_missing', count: facet.missing }];
              }
            }
          });

          if (
            data.facets.hasOwnProperty('consequenceType') &&
            data.facets.consequenceType.hasOwnProperty('terms')
          ) {
            data.facets.consequenceType.terms = data.facets.consequenceType.terms.sort(function(
              a,
              b
            ) {
              return precedence.indexOf(a.term) - precedence.indexOf(b.term);
            });
          }
          if (
            data.facets.hasOwnProperty('functionalImpact') &&
            data.facets.functionalImpact.hasOwnProperty('terms')
          ) {
            data.facets.functionalImpact.terms = data.facets.functionalImpact.terms.sort(function(
              a,
              b
            ) {
              return ImpactOrder.indexOf(a.term) - ImpactOrder.indexOf(b.term);
            });
          }
        }

        return data;
      });
    };

    this.one = function(id) {
      return id ? Mutation.init(id) : Mutation;
    };
  });

  module.service('Mutation', function(Restangular) {
    var _this = this;
    this.handler = {};

    this.init = function(id) {
      this.handler = Restangular.one('mutations', id);
      return _this;
    };

    this.get = function(params) {
      var defaults = {};

      return this.handler.get(angular.extend(defaults, params));
    };
  });

  module.service('Occurrences', function(Restangular, FilterService, Occurrence, ApiService) {
    this.handler = Restangular.all('occurrences');

    this.getList = function(params) {
      var defaults = {
        size: 10,
        from: 1,
        filters: FilterService.filters(),
      };

      return this.handler.get('', angular.extend(defaults, params));
    };

    this.getAll = function(params) {
      return ApiService.getAll(this.handler, params);
    };

    this.one = function(id) {
      return id ? Occurrence.init(id) : Occurrence;
    };
  });

  module.service('Occurrence', function(Restangular) {
    var _this = this;
    this.handler = {};

    this.init = function(id) {
      this.handler = Restangular.one('occurrences', id);
      return _this;
    };

    this.get = function(params) {
      var defaults = {};

      return this.handler.get(angular.extend(defaults, params));
    };
  });

  module.service('Transcripts', function(Restangular, FilterService, Transcript) {
    this.handler = Restangular.all('occurrences');

    this.getList = function(params) {
      var defaults = {
        size: 10,
        from: 1,
        filters: FilterService.filters(),
      };

      return this.handler.get('', angular.extend(defaults, params));
    };

    this.one = function(id) {
      return id ? Transcript.init(id) : Transcript;
    };
  });

  module.service('Transcript', function(Restangular) {
    var _this = this;
    this.handler = {};

    this.init = function(id) {
      this.handler = Restangular.one('transcripts', id);
      return _this;
    };

    this.get = function(params) {
      var defaults = {};

      return this.handler.get(angular.extend(defaults, params));
    };

    this.getMutations = function(params) {
      var defaults = {};

      return this.handler.one('mutations', '').get(angular.extend(defaults, params));
    };
  });

  module.service('Protein', function(Restangular) {
    var _this = this;
    this.handler = {};

    this.init = function(id) {
      this.handler = Restangular.one('protein', id);
      return _this;
    };

    this.get = function(params) {
      var defaults = {};

      return this.handler.get(angular.extend(defaults, params));
    };
  });
})();
