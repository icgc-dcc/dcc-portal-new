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

(function () {
  'use strict';

  var module = angular.module('icgc.pathways', [
    'icgc.enrichment.directives', 'icgc.sets.services'
  ]);
  
  module
    .constant('PathwaysConstants', {
      EVENTS: {
        MODEL_READY_EVENT: 'icgc.pathways.ready.event'
      }
    })
    .config(function ($stateProvider) {
      $stateProvider.state('pathways', {
        url: '/pathways/:entityID',
        templateUrl: '/scripts/pathwayviewer/views/pathways.html',
        controller: 'PathwaysController',
        resolve: {
          EnrichmentData: ['$q', '$stateParams', 'Restangular',
            
            function ($q, $stateParams, Restangular) {
              var entityID = $stateParams.entityID,
                deferred = $q.defer();
              
              Restangular.one('analysis/enrichment', entityID).get()
                .then(function (rectangularEnrichmentData) {
                    return deferred.resolve(rectangularEnrichmentData.plain());
                  },
                  function (response) {
                    return deferred.reject(response);
                  }
                );
              
              return deferred.promise;
            }]
        }
      });
    });
  
  
  module.controller('PathwaysController', function ($scope, $q, Page, EnrichmentData, Restangular,
                                                    GeneSetService, GeneSetHierarchy, GeneSets,
                                                    GeneSetVerificationService, TooltipText,
                                                    LocationService, EnrichmentService, SetService,
                                                    PathwaysConstants, RestangularNoCache, PathwayDataService) {


    var _selectedPathway = null;

    function _resolveEnrichmentData(Id) {
      $scope.analysis.isLoading = true;

      SetService.pollingResolveSetFactory(Id, 2000, 10)
      	.setRetrievalEntityFunction(function () {
        	return RestangularNoCache.one('analysis/enrichment', Id).get();
      	})
        .setResolvedEntityFunction(function (entityData) {
          return entityData.state.toUpperCase() === 'FINISHED';
        })
        .resolve()
      	.then(function (entityData) {

	        _initAnalysisScope(entityData);

        	if (!_selectedPathway) {
            return;
        	}

       	var _updateSelectedPathway = _.first(
           _.filter(entityData.results, function (pathway) {
            return pathway.geneSetId === _selectedPathway.geneSetId;
          })
        );

        _.assign(_selectedPathway, _updateSelectedPathway);
        $scope.analysis.isLoading = false;

      });
    }

    function _initAnalysisScope(entityRecords) {
      $scope.pathways = entityRecords.results;
      $scope.analysis = {
        getID: function () {
          return entityRecords.id;
        },
        getData: function () {
          return entityRecords;
        },
        getContext: function () {
          return 'pathways';
        }
      };
    }

    function _init() {
      Page.stopWork();
      Page.setPage('entity');
      Page.setTitle('Enrichment Analysis Pathway Viewer');

      $scope.TooltipText = TooltipText;

      _initAnalysisScope(EnrichmentData);
      $scope.analysis.isLoading = true;

      // Select the first gene set in the pathway as the
      // default value if one exists...
      var firstGenesetPathway = _.first($scope.pathways);

      if (firstGenesetPathway) {
        $scope.setSelectedPathway(firstGenesetPathway);
      }

      if (EnrichmentData.state !== 'FINISHED') {
        _resolveEnrichmentData(EnrichmentData.id);
      }
      else {
        $scope.analysis.isLoading = false;
      }

    }

    function _addFilters(pathway) {

      if (_.get(pathway, 'geneSetFilters', false)) {
        return;
      }

      pathway.geneSetFilters = EnrichmentService.geneSetFilters(EnrichmentData, pathway);
      pathway.geneSetOverlapFilters = EnrichmentService.geneSetOverlapFilters(EnrichmentData, pathway);

    }

    $scope.getSelectedPathway = function () {
      return _selectedPathway;
    };

    $scope.setSelectedPathway = function (pathway) {
      $scope.pathway = {};

      _addFilters(pathway);
      _selectedPathway = pathway;

      PathwayDataService.getPathwayData(pathway)
        .then(function (pathwayData) {
          $scope.geneSet = pathwayData.geneSet;
          $scope.pathway = {
            xml: pathwayData.xml,
            zooms: pathwayData.zooms,
            mutationHighlights: pathwayData.mutationHighlights,
            drugHighlights: pathwayData.drugHighlights,
            overlaps: pathwayData.overlaps
          };
          $scope.uiParentPathways = pathwayData.uiParentPathways;

          setTimeout(function () {
            $scope.$broadcast(PathwaysConstants.EVENTS.MODEL_READY_EVENT, {});
          }, 100);
        }).catch(function () {
          $scope.pathway = {
            xml: '',
            zooms: [''],
            mutationHighlights: [],
            drugHighlights: []
          };
        });
    };
    // Initialize our controller and it's corresponding scope.
    _init();
  });

  module.service('PathwayDataService', function ($q, Restangular, GeneSetHierarchy, GeneSetService, SetService,
                                               CompoundsService, GeneSetVerificationService, LocationService) {
      var _pathwayDataService = this;
      _pathwayDataService.getGeneSet = function (geneSetId) {
         return Restangular.one('genesets').one(geneSetId).get().then(function (geneSet) {
           return geneSet;
         });
      };
      _pathwayDataService.getUIParentPathways = function (geneSet) {
        return GeneSetHierarchy.uiPathwayHierarchy(geneSet.hierarchy, geneSet);
      };
      _pathwayDataService.getParentPathwayId = function (geneSet) {
        return _pathwayDataService.getUIParentPathways(geneSet)[0].geneSetId;
      };
      _pathwayDataService.getPathwayId = function (geneSet) {
        return _pathwayDataService.getUIParentPathways(geneSet)[0].diagramId;
      };
      _pathwayDataService.getPathwayXML = function (geneSet) {
        return GeneSetService.getPathwayXML(_pathwayDataService.getPathwayId(geneSet)).then(function (pathwayXML) {
          return pathwayXML;
        });
      };
      _pathwayDataService.getPathwayZoom = function (geneSet) {
        if (_pathwayDataService.getParentPathwayId(geneSet) === _pathwayDataService.getPathwayId(geneSet)) {
          return $q.resolve;
        }
       
        return GeneSetService.getPathwayZoom(_pathwayDataService.getParentPathwayId(geneSet))
          .then(function (pathwayZoom) {
            return pathwayZoom;
          });
      };
      _pathwayDataService.getPathwayProteinMap = function (geneSet) {
        return GeneSetService.getPathwayProteinMap(_pathwayDataService.getParentPathwayId(geneSet), [])
          .then(function (pathwayProteinMap) {
            return pathwayProteinMap;
          });
      };
      _pathwayDataService.getEntitySetId = function (geneSet) {
        return SetService.getTransientSet('GENE', {
          'filters': {gene:{pathwayId:{is:[_pathwayDataService.getParentPathwayId(geneSet)]}}},
          'sortBy': 'id',
          'sortOrder': 'ASCENDING',
          'name': _pathwayDataService.getParentPathwayId(geneSet),
          'size': geneSet.geneCount,
          'transient': true 
        }).then(function (entitySetData) {
          return entitySetData.id;
        });
      };
      _pathwayDataService.getDrugs = function (entitySetId) {
        return CompoundsService.getCompoundsFromEntitySetId(entitySetId).then(function(drugs) {  
          return drugs;
        });
      };
      _pathwayDataService.getMutationHighlights = function (pathwayProteinMap) {
        var pathwayMutationHighlights = [];
        _.forEach(pathwayProteinMap, function (value, id) {
          if (value && value.dbIds) {
            var dbIds = value.dbIds.split(',');
            pathwayMutationHighlights.push({
              uniprotId: id,
              dbIds: dbIds,
              value: value.value
            });
          }
        });
        return pathwayMutationHighlights;
      };
      _pathwayDataService.getDrugHighlights = function (drugs, pathwayProteinMap) {
        var drugMap = {};
        _.forEach(drugs, function(drug) {
          _.forEach(drug.genes, function(gene) {
            var uniprotId = gene.uniprot;
            
            if (_.isUndefined(drugMap[uniprotId])) {
              drugMap[uniprotId] = [];
            }

            drugMap[uniprotId].push({
              'zincId': drug.zincId,
              'name': drug.name
            });
          });
        });
       
        var pathwayDrugHighlights = [];
        _.forEach(pathwayProteinMap,function(value,id) {
          if(value && value.dbIds && drugMap[id]) {
            pathwayDrugHighlights.push({
              uniprotId:id,
              dbIds:value.dbIds.split(','),
              drugs:drugMap[id]
            });
          }
        });
        return pathwayDrugHighlights;
      };
      _pathwayDataService.getGeneListData = function (pathway) {
        return Restangular.one('genes').get({filters: pathway.geneSetOverlapFilters}).then(function (geneListData) {
          return geneListData;
        });
      };
      _pathwayDataService.getGeneOverlapExistsHash = function (geneListData) {
        if (!_.get(geneListData, 'hits[0]')) {
          return {};
        }

        var geneList = [];
        _.forEach(geneListData.hits, function (gene) {
          var overlapGeneExternalIDs = _.get(gene,  'externalDbIds.uniprotkb_swissprot', false);

          // We can't join by this ID (with the pathway viewer) so throw away
          if (!overlapGeneExternalIDs) {
            return;
          }

          geneList.push.apply(geneList, overlapGeneExternalIDs);
        });

        var geneOverlapExistsHash = {};
        _.forEach(geneList, function (g) {
          geneOverlapExistsHash[g] = true;
        });
        return geneOverlapExistsHash;
      };
      _pathwayDataService.getGeneAnnotatedHighlights = function (highlightData) {
        var uniprotIds = _.map(highlightData.highlights, 'uniprotId');
        return GeneSetVerificationService.verify(uniprotIds.join(',')).then(function (data) {
          var annotatedHighlights = [];
          _.forEach(highlightData.highlights, function (highlight) {
            var annotatedHighlight = Object.assign({}, highlight);
            var geneKey = 'external_db_ids.uniprotkb_swissprot';
            if (!data.validGenes[geneKey]) {
              return;
            }

            var uniprotObj = data.validGenes[geneKey][annotatedHighlight.uniprotId];
            if (!uniprotObj) {
              return;
            }

            var ensemblId = uniprotObj[0].id;
            if (highlightData.includeAdvQuery) {
              annotatedHighlight.advQuery = LocationService.mergeIntoFilters({
                gene: {id: {is: [ensemblId]}}
              });
            }
            annotatedHighlight.geneSymbol = uniprotObj[0].symbol;
            annotatedHighlight.geneId = ensemblId;

            annotatedHighlights.push(annotatedHighlight);
          });

          return annotatedHighlights;
        });
      };
      _pathwayDataService.getGeneOverlapExistsHashUsingDbIds = function (geneOverlapExistsHash, annotatedHighlights) {
        var geneOverlapExistsHashUsingDbIds = Object.assign({}, geneOverlapExistsHash);
        var geneCount = 0;
        _.forEach(annotatedHighlights, function (annotatedHighlight) {
          if (angular.isDefined(geneOverlapExistsHashUsingDbIds[annotatedHighlight.uniprotId])) {
            geneCount++;

            _.forEach(annotatedHighlight.dbIds, function (dbID) {
              // Swap in Reactome keys but maintain the id we use this to determine overlaps in O(1)
              // later... The dbID is used as a reference to the reactome SVG nodes...
              geneOverlapExistsHashUsingDbIds[dbID] = {
                id: annotatedHighlight.uniprotId,
                geneId: annotatedHighlight.geneId,
                geneSymbol: annotatedHighlight.geneSymbol
              };
            });
            delete geneOverlapExistsHashUsingDbIds[annotatedHighlight.uniprotId];
          }
        });
        console.log(geneCount + ' Overlapped genes validated! ');
        return geneOverlapExistsHashUsingDbIds;
      };

      _pathwayDataService.getPathwayData = function (pathway) {
        var pathwayData = {};
        return _pathwayDataService.getGeneSet(pathway.geneSetId)
        .then(function (geneSet) {
          pathwayData.geneSet = geneSet;

          return $q.all([
            _pathwayDataService.getPathwayProteinMap(geneSet),
            _pathwayDataService.getEntitySetId(geneSet),
            _pathwayDataService.getPathwayXML(geneSet),
            _pathwayDataService.getPathwayZoom(geneSet),
            _pathwayDataService.getUIParentPathways(geneSet)
          ]);
        })
        .then(function (results) {
          var pathwayProteinMap = results[0];
          var entitySetId = results[1];

          pathwayData.xml = results[2];
          pathwayData.zooms = results[3];
          pathwayData.uiParentPathways = results[4];

          return $q.all([
            _pathwayDataService.getGeneListData(pathway),
            pathwayProteinMap,
            _pathwayDataService.getDrugs(entitySetId)
          ]);
        })
        .then(function (results) {
          var geneListData = results[0];
          var pathwayProteinMap = results[1];
          var drugs = results[2];

          var mutationHighlights = _pathwayDataService.getMutationHighlights(pathwayProteinMap);
          var drugHighlights = _pathwayDataService.getDrugHighlights(drugs, pathwayProteinMap);

          return $q.all([
            _pathwayDataService.getGeneOverlapExistsHash(geneListData),
            _pathwayDataService.getGeneAnnotatedHighlights({
              highlights: mutationHighlights,
              includeAdvQuery: true
            }),
            _pathwayDataService.getGeneAnnotatedHighlights({
              highlights: drugHighlights,
              includeAdvQuery: false
            })
          ]);
        })
        .then(function (results) {
          pathwayData.overlaps = _pathwayDataService.getGeneOverlapExistsHashUsingDbIds(
            results[0], _.union(results[1], results[2])
          );
          pathwayData.mutationHighlights = results[1];
          pathwayData.drugHighlights = results[2];

          pathwayData.geneSet.showPathway = true;
          
          return pathwayData;
        });
      };
  });
})();